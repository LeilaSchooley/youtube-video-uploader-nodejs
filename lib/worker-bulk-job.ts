import { google } from "googleapis";
import {
  markBulkAsProcessing,
  markBulkAsCompleted,
  markBulkAsFailed,
  updateBulkProgress,
  type BulkUploadItem,
} from "./bulk-queue";
import { loadSessions, getSession } from "./session";
import { getOAuthClient, getDropboxToken } from "./auth";
import type { UploadTask } from "./worker-upload";
import { workerProcessBatch } from "./worker-upload";

export async function runWorkerBulkJob(jobId: string, batchSize: number): Promise<void> {
  const { getBulkQueueItem } = await import("./bulk-queue");
  const job = getBulkQueueItem(jobId);

  if (!job) {
    console.error(`[WORKER] Job ${jobId} not found`);
    return;
  }

  // Allow both "pending" and "processing" jobs (processing = waiting for next day's batch)
  if (job.status !== "pending" && job.status !== "processing") {
    console.log(
      `[WORKER] Job ${jobId} is not pending/processing (status: ${job.status})`,
    );
    return;
  }

  markBulkAsProcessing(jobId);

  // Get session and authenticate
  loadSessions();
  let session = getSession(job.sessionId);

  if (!session) {
    loadSessions();
    session = getSession(job.sessionId);
  }

  if (!session || !session.authenticated || !session.tokens) {
    markBulkAsFailed(jobId, "Session not authenticated");
    console.error(`[WORKER] Job ${jobId}: Session not authenticated`);
    return;
  }

  const oAuthClient = getOAuthClient();
  oAuthClient.setCredentials(session.tokens);

  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });

  const dropboxToken = await getDropboxToken(
    session.dropboxToken,
    session.dropboxRefreshToken,
    job.sessionId,
  );

  // Determine which videos to upload TODAY (using UTC for consistency)
  const now = new Date();
  const today = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  ); // Start of today in UTC

  // Get job start date (convert to UTC)
  const startDateRaw = job.startDate
    ? new Date(job.startDate)
    : new Date(job.createdAt);
  const startDate = new Date(
    Date.UTC(
      startDateRaw.getUTCFullYear(),
      startDateRaw.getUTCMonth(),
      startDateRaw.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  ); // Start of start date in UTC

  // Calculate how many days since job started
  const daysSinceStart = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Find which videos have already been processed
  const completedIndices = new Set<number>();
  const failedIndices = new Set<number>();
  (job.progress || []).forEach((p: BulkUploadItem["progress"][number]) => {
    if (p && typeof p.index === "number") {
      if (
        p.videoId ||
        (p.status &&
          (p.status.includes("Uploaded") ||
            p.status.includes("Scheduled") ||
            p.status.includes("scheduled")))
      ) {
        completedIndices.add(p.index);
      } else if (p.status && p.status.includes("Failed")) {
        failedIndices.add(p.index);
      }
    }
  });

  const totalVideos = job.items.length;
  const completedCount = completedIndices.size;
  const failedCount = failedIndices.size;
  const processedCount = completedCount + failedCount;

  console.log(
    `[WORKER] Job ${jobId}: ${totalVideos} total, ${completedCount} completed, ${failedCount} failed, ${totalVideos - processedCount} pending`,
  );

  // If all videos are done, mark job complete
  if (processedCount >= totalVideos) {
    markBulkAsCompleted(jobId);
    console.log(
      `[WORKER] Job ${jobId} completed: ${completedCount} succeeded, ${failedCount} failed`,
    );
    return;
  }

  // Determine today's batch
  let todaysBatch: UploadTask[] = [];

  if (job.videosPerDay && job.videosPerDay > 0) {
    // Calculate which video indices are for TODAY based on videosPerDay
    // Day 0: indices 0 to (videosPerDay - 1)
    // Day 1: indices videosPerDay to (2 * videosPerDay - 1)
    // etc.
    const todayStartIndex = daysSinceStart * job.videosPerDay;
    const todayEndIndex = Math.min(
      todayStartIndex + job.videosPerDay,
      totalVideos,
    );

    console.log(
      `[WORKER] Day ${daysSinceStart}: Processing videos ${todayStartIndex + 1} to ${todayEndIndex} (${job.videosPerDay}/day limit)`,
    );

    // If today's batch hasn't started yet (future day), wait
    if (daysSinceStart < 0) {
      console.log(
        `[WORKER] Job ${jobId}: Start date is in the future, waiting...`,
      );
      return;
    }

    // Get today's videos that haven't been processed yet
    for (let i = todayStartIndex; i < todayEndIndex && i < totalVideos; i++) {
      if (!completedIndices.has(i) && !failedIndices.has(i)) {
        const item = job.items[i];
        todaysBatch.push({
          index: i,
          item: { ...item },
        });
      }
    }

    if (todaysBatch.length === 0) {
      // Today's batch is complete, but there are more videos for future days
      const nextDayIndex = daysSinceStart + 1;
      const nextBatchStartIndex = nextDayIndex * job.videosPerDay;

      if (nextBatchStartIndex < totalVideos) {
        console.log(
          `[WORKER] Job ${jobId}: Today's batch complete. Next batch (videos ${nextBatchStartIndex + 1}+) scheduled for tomorrow.`,
        );
        // Keep job in "processing" status - worker will check again tomorrow
        return;
      } else {
        // No more batches, job is complete
        markBulkAsCompleted(jobId);
        console.log(
          `[WORKER] Job ${jobId} completed: ${completedCount} succeeded, ${failedCount} failed`,
        );
        return;
      }
    }
  } else {
    // No videosPerDay limit - process all remaining videos
    console.log(
      `[WORKER] No daily limit set, processing all ${totalVideos - processedCount} remaining videos`,
    );

    for (let i = 0; i < totalVideos; i++) {
      if (!completedIndices.has(i) && !failedIndices.has(i)) {
        const item = job.items[i];
        todaysBatch.push({
          index: i,
          item: { ...item },
        });
      }
    }
  }

  console.log(
    `[WORKER] Processing ${todaysBatch.length} videos today for job ${jobId}`,
  );

  // Process publishAt from sheet (for YouTube's scheduled publish feature)
  // This is INDEPENDENT from videosPerDay (upload limit)
  const MIN_SCHEDULE_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

  todaysBatch = todaysBatch.map((task) => {
    const taskItem = { ...task.item };

    // Check if video has publishAt from the sheet
    if (
      taskItem.publishDate &&
      typeof taskItem.publishDate === "string" &&
      taskItem.publishDate.trim()
    ) {
      const publishDate = new Date(taskItem.publishDate);
      if (isNaN(publishDate.getTime())) {
        // Invalid date - upload as public
        console.log(
          `[WORKER] Video ${task.index + 1}: Invalid publishAt "${taskItem.publishDate}", uploading as public`,
        );
        delete taskItem.publishDate;
        if (!taskItem.privacyStatus) taskItem.privacyStatus = "public";
      } else if (
        publishDate.getTime() <=
        now.getTime() + MIN_SCHEDULE_BUFFER_MS
      ) {
        // Date is too soon or in past - upload as public
        console.log(
          `[WORKER] Video ${task.index + 1}: publishAt is past/too soon, uploading as public`,
        );
        delete taskItem.publishDate;
        if (!taskItem.privacyStatus) taskItem.privacyStatus = "public";
      } else {
        // Valid future date - will schedule on YouTube
        console.log(
          `[WORKER] Video ${task.index + 1}: Will be scheduled on YouTube for ${publishDate.toISOString()}`,
        );
        taskItem.privacyStatus = "private"; // Required for YouTube scheduling
      }
    } else {
      // No publishAt - upload as public (or whatever privacy was specified)
      if (!taskItem.privacyStatus) taskItem.privacyStatus = "public";
    }

    return { index: task.index, item: taskItem };
  });

  // Create smaller batches for parallel processing (3 at a time)
  const tasks = todaysBatch;

  // Process in batches
  const batches: UploadTask[][] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    batches.push(tasks.slice(i, i + batchSize));
  }

  // Track progress in memory to avoid race conditions with disk writes
  let localProgress = [...(job.progress || [])];

  const sendProgress = (
    index: number,
    status: string,
    videoId?: string,
    error?: string,
    duration?: number,
  ) => {
    const item = job.items[index];
    const title = item?.title || `Video ${index + 1}`;
    // Include title in status for better visibility
    const statusWithTitle = status.includes(title)
      ? status
      : `${title}: ${status}`;
    localProgress[index] = {
      index,
      status: statusWithTitle,
      videoId,
      error,
      ...(duration != null && { duration }),
      title,
    };

    // Write immediately if this is a final status (success or failure)
    const isFinal = !!(videoId || error);
    updateBulkProgress(jobId, localProgress, isFinal);
  };

  try {
    // Validate TODAY's batch items have video sources
    const tasksWithoutSource = tasks.filter(
      (task) =>
        !task.item.driveFileId &&
        !task.item.dropboxFileId &&
        !task.item.url &&
        !task.item.file,
    );

    if (tasksWithoutSource.length > 0) {
      console.warn(
        `[WORKER] ${tasksWithoutSource.length} item(s) in today's batch missing video source`,
      );

      // Mark items without sources as failed, but continue with others
      tasksWithoutSource.forEach((task) => {
        sendProgress(
          task.index,
          `Failed: Missing video source`,
          undefined,
          "No video source found",
        );
      });

      // Remove invalid tasks from today's batch
      const validTasks = tasks.filter(
        (task) =>
          task.item.driveFileId ||
          task.item.dropboxFileId ||
          task.item.url ||
          task.item.file,
      );

      if (validTasks.length === 0) {
        console.log(
          `[WORKER] No valid items in today's batch for job ${jobId}`,
        );
        // Don't fail the whole job - there might be valid items in future batches
        return;
      }

      // Update batches with valid tasks only
      batches.length = 0;
      for (let i = 0; i < validTasks.length; i += batchSize) {
        batches.push(validTasks.slice(i, i + batchSize));
      }
    }

    // Process today's batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `[WORKER] Uploading batch ${i + 1}/${batches.length} (${batch.length} videos)`,
      );
      await workerProcessBatch(
        youtube,
        batch,
        sendProgress,
        oAuthClient,
        dropboxToken,
        job.sessionId,
        session.dropboxRefreshToken,
        jobId,
      );
    }

    // Check progress after today's batch (use in-memory progress for accuracy)
    const totalItems = job.items.length;
    const successfulItems = localProgress.filter(
      (p) => p && p.videoId && !p.error,
    ).length;
    const failedItems = localProgress.filter((p) => p && p.error).length;
    const totalProcessed = successfulItems + failedItems;

    console.log(
      `[WORKER] Job ${jobId} today's summary: ${tasks.length} attempted, total progress: ${successfulItems}/${totalItems} succeeded, ${failedItems} failed`,
    );

    // Check if ALL videos are done (either succeeded or failed)
    if (totalProcessed >= totalItems) {
      markBulkAsCompleted(jobId);
      console.log(
        `[WORKER] Job ${jobId} COMPLETED: ${successfulItems} succeeded, ${failedItems} failed`,
      );
      return;
    }

    // More videos to process on future days
    if (job.videosPerDay && job.videosPerDay > 0) {
      const remainingVideos = totalItems - totalProcessed;
      const remainingDays = Math.ceil(remainingVideos / job.videosPerDay);
      console.log(
        `[WORKER] Job ${jobId}: ${remainingVideos} videos remaining, ~${remainingDays} more day(s) to complete`,
      );
      console.log(
        `[WORKER] Job ${jobId}: Will continue tomorrow with next batch of ${job.videosPerDay} videos`,
      );
      // Job stays in "processing" status - worker will check again later
      return;
    }
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";
    console.error(`[WORKER] Job ${jobId} error:`, errorMessage);
    // Don't fail the whole job for individual errors - keep processing
  }
}
