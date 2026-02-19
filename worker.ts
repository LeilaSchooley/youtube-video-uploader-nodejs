#!/usr/bin/env node

/**
 * Background worker for processing bulk uploads
 * This worker processes uploads from the bulk queue asynchronously
 */

import {
  getBulkQueue,
  getNextPendingBulkItem,
  markBulkAsProcessing,
  markBulkAsCompleted,
  markBulkAsFailed,
  updateBulkProgress,
} from "./lib/bulk-queue";
import { appendUploadedVideo } from "./lib/uploaded-videos";
import { getSession, loadSessions } from "./lib/session";
import { getOAuthClient, getDropboxToken } from "./lib/auth";
import { google } from "googleapis";
import { fetchFileAsStream, isValidUrl } from "./lib/url-stream";
import {
  downloadDriveFile,
  isDriveFileId,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
  getDriveFileMetadata,
} from "./lib/drive";
import {
  downloadDropboxFile,
  isDropboxPath,
  renameDropboxFile,
  moveDropboxFile,
  deleteDropboxFile,
  getDropboxFileMetadata,
} from "./lib/dropbox";
import { Readable } from "stream";
import fs from "fs";
import { workerLog } from "./lib/worker-logger";
import { writeHeartbeat } from "./lib/worker-health";
import { withRetry } from "./lib/youtube-retry";

const WORKER_INTERVAL = 5000; // Check for new jobs every 5 seconds
const BATCH_SIZE = 3; // Process 3 videos at a time

interface UploadTask {
  index: number;
  item: {
    file?: {
      name: string;
      path?: string;
    };
    url?: string;
    driveFileId?: string;
    driveThumbnailId?: string;
    dropboxFileId?: string;
    dropboxThumbnailId?: string;
    authHeaders?: Record<string, string>;
    timeout?: number;
    title?: string;
    description?: string;
    privacyStatus?: "public" | "private" | "unlisted";
    publishDate?: string;
    thumbnailUrl?: string;
    thumbnailPath?: string;
    postUploadAction?: string;
    completedFolderId?: string;
    madeForKids?: boolean;
  };
}

/**
 * Get video stream from file, URL, Drive, or Dropbox
 */
async function getVideoStream(
  task: UploadTask,
  oAuthClient: ReturnType<typeof getOAuthClient>,
  dropboxToken?: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<Readable> {
  const { item } = task;

  // Priority: Drive > Dropbox > URL > File
  if (item.driveFileId && isDriveFileId(item.driveFileId)) {
    return await downloadDriveFile(item.driveFileId, oAuthClient);
  }

  // Handle Dropbox files
  if (item.dropboxFileId && isDropboxPath(item.dropboxFileId)) {
    if (!dropboxToken) {
      throw new Error("Dropbox token required but not available");
    }
    return await downloadDropboxFile(
      item.dropboxFileId,
      dropboxToken,
      sessionId,
      sessionRefreshToken,
    );
  }

  // Handle URL-based upload
  if (item.url && isValidUrl(item.url)) {
    return await fetchFileAsStream(item.url, {
      timeout: item.timeout || 30 * 60 * 1000, // 30 minutes default for large video URLs
      headers: item.authHeaders || {},
    });
  }

  // Handle file-based upload
  if (item.file) {
    // Server file path
    if (item.file.path && fs.existsSync(item.file.path)) {
      return fs.createReadStream(item.file.path);
    }

    throw new Error(`File not found: ${item.file.path || item.file.name}`);
  }

  throw new Error("No valid video source found");
}

/**
 * Get thumbnail stream if available
 */
async function getThumbnailStream(
  task: UploadTask,
  oAuthClient: ReturnType<typeof getOAuthClient>,
  dropboxToken?: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<Readable | null> {
  const { item } = task;

  // Priority: Drive > Dropbox > URL > File
  if (item.driveThumbnailId && isDriveFileId(item.driveThumbnailId)) {
    return await downloadDriveFile(item.driveThumbnailId, oAuthClient);
  }

  // Handle Dropbox thumbnails
  if (item.dropboxThumbnailId && isDropboxPath(item.dropboxThumbnailId)) {
    if (!dropboxToken) {
      console.warn(
        "[WORKER] Dropbox thumbnail requested but token not available",
      );
      return null;
    }
    try {
      return await downloadDropboxFile(
        item.dropboxThumbnailId,
        dropboxToken,
        sessionId,
        sessionRefreshToken,
      );
    } catch (error: any) {
      console.error(
        `[WORKER] Failed to download Dropbox thumbnail: ${error?.message}`,
      );
      return null;
    }
  }

  // Thumbnail URL
  if (item.thumbnailUrl && isValidUrl(item.thumbnailUrl)) {
    return await fetchFileAsStream(item.thumbnailUrl, {
      timeout: 60000, // 1 minute for thumbnails
    });
  }

  // Thumbnail file path
  if (item.thumbnailPath && fs.existsSync(item.thumbnailPath)) {
    return fs.createReadStream(item.thumbnailPath);
  }

  return null;
}

/**
 * Upload a single video
 */
async function uploadVideo(
  youtube: ReturnType<typeof google.youtube>,
  task: UploadTask,
  sendProgress: (
    index: number,
    status: string,
    videoId?: string,
    error?: string,
  ) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>,
  dropboxToken?: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const { index, item } = task;

  try {
    // Get title and description
    const title = item.title || `Video ${index + 1}`;
    const description = item.description || `Uploaded video ${index + 1}`;
    const privacyStatus = item.privacyStatus || "public";

    // Prepare request body
    const requestBody: {
      snippet: { title: string; description: string };
      status: {
        privacyStatus: string;
        publishAt?: string;
        selfDeclaredMadeForKids?: boolean;
      };
    } = {
      snippet: { title, description },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: item.madeForKids ?? false, // Default to false (not made for kids)
      },
    };

    // Only set publishAt if it's a valid future date (15+ minutes from now)
    if (
      item.publishDate &&
      typeof item.publishDate === "string" &&
      item.publishDate.trim()
    ) {
      const publishDate = new Date(item.publishDate);
      const now = new Date();
      const minScheduleTime = now.getTime() + 15 * 60 * 1000; // 15 minutes from now

      if (
        !isNaN(publishDate.getTime()) &&
        publishDate.getTime() > minScheduleTime
      ) {
        // Ensure the scheduled time is at least at the start of the next hour to avoid edge cases
        const safePublishDate = new Date(publishDate);
        // If scheduling for today/tomorrow, ensure time is in the future
        if (safePublishDate.getTime() < now.getTime() + 60 * 60 * 1000) {
          // Less than 1 hour from now - push to next hour
          safePublishDate.setHours(safePublishDate.getHours() + 1, 0, 0, 0);
        }

        // Double-check it's still in the future
        if (safePublishDate.getTime() > now.getTime() + 15 * 60 * 1000) {
          requestBody.status.publishAt = safePublishDate.toISOString();
          requestBody.status.privacyStatus = "private";
          console.log(
            `[WORKER] Video ${index + 1}: Scheduling for ${safePublishDate.toISOString()}`,
          );
        } else {
          console.log(
            `[WORKER] Video ${index + 1}: Adjusted date still too soon, uploading as public`,
          );
          requestBody.status.privacyStatus = "public";
        }
      } else {
        // Date is invalid or too soon - upload immediately as public
        console.log(
          `[WORKER] Video ${index + 1}: publishDate "${item.publishDate}" is invalid or too soon, uploading as public`,
        );
        requestBody.status.privacyStatus = "public";
      }
    }

    // Determine video source for status message
    let sourceInfo = "";
    if (item.driveFileId) {
      sourceInfo = "from Google Drive";
    } else if (item.dropboxFileId) {
      sourceInfo = "from Dropbox";
    } else if (item.url) {
      sourceInfo = "from URL";
    } else if (item.file) {
      sourceInfo = `file: ${item.file.name}`;
    }

    sendProgress(index, `Fetching video ${sourceInfo}...`);

    sendProgress(index, `Uploading "${title}" to YouTube...`);

    const uploadStartTime = Date.now();
    const result = await withRetry(
      async () => {
        const videoStream = await getVideoStream(
          task,
          oAuthClient,
          dropboxToken,
          sessionId,
          sessionRefreshToken,
        );
        return youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
      },
      (attempt, status, delayMs) => {
        workerLog.warn("YouTube API rate/quota limit, retrying", {
          index,
          status,
          attempt,
          delayMs,
        });
      },
    );

    const videoId = result.data.id;
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (!videoId) {
      return {
        success: false,
        error: "Upload succeeded but no video ID returned",
      };
    }

    sendProgress(
      index,
      `Uploaded successfully (${uploadDuration.toFixed(1)}s)`,
      videoId,
    );

    // Upload thumbnail if available
    const thumbnailStream = await getThumbnailStream(
      task,
      oAuthClient,
      dropboxToken,
      sessionId,
      sessionRefreshToken,
    );
    if (thumbnailStream && videoId) {
      sendProgress(index, "Uploading thumbnail...", videoId);
      try {
        await youtube.thumbnails.set({
          videoId: videoId,
          media: { body: thumbnailStream },
        });
        sendProgress(index, "Thumbnail uploaded", videoId);
      } catch (thumbError: any) {
        console.error(
          `[WORKER] Thumbnail upload failed for video ${index}:`,
          thumbError,
        );
        // Don't fail the whole upload
      }
    }

    // Post-upload actions for Drive files
    if (
      item.driveFileId &&
      videoId &&
      item.postUploadAction &&
      item.postUploadAction !== "none"
    ) {
      try {
        switch (item.postUploadAction.toLowerCase()) {
          case "rename":
            const fileMetadata = await getDriveFileMetadata(
              item.driveFileId,
              oAuthClient,
            );
            const extension = fileMetadata.name.split(".").pop() || "mp4";
            const newName = `${videoId}.${extension}`;
            await renameDriveFile(item.driveFileId, newName, oAuthClient);
            sendProgress(index, `Renamed to ${newName}`, videoId);
            break;

          case "delete":
            await deleteDriveFile(item.driveFileId, oAuthClient);
            sendProgress(index, "Deleted from Drive", videoId);
            break;

          case "move":
            if (item.completedFolderId) {
              await moveDriveFile(
                item.driveFileId,
                item.completedFolderId,
                oAuthClient,
              );
              sendProgress(index, `Moved to folder`, videoId);
            } else {
              console.warn(
                `[WORKER] Move action requested but no completedFolderId provided`,
              );
            }
            break;
        }
      } catch (actionError: any) {
        console.error(
          `[WORKER] Post-upload action failed for video ${index}:`,
          actionError,
        );
        // Don't fail the upload - action is optional
      }
    }

    // Post-upload actions for Dropbox files
    if (
      item.dropboxFileId &&
      videoId &&
      item.postUploadAction &&
      item.postUploadAction !== "none" &&
      dropboxToken
    ) {
      try {
        switch (item.postUploadAction.toLowerCase()) {
          case "rename":
            const dropboxMetadata = await getDropboxFileMetadata(
              item.dropboxFileId,
              dropboxToken,
              sessionId,
              sessionRefreshToken,
            );
            const dropboxExtension =
              dropboxMetadata.name.split(".").pop() || "mp4";
            const dropboxNewName = `${videoId}.${dropboxExtension}`;
            await renameDropboxFile(
              item.dropboxFileId,
              dropboxNewName,
              dropboxToken,
              sessionId,
              sessionRefreshToken,
            );
            sendProgress(index, `Renamed to ${dropboxNewName}`, videoId);
            break;

          case "delete":
            await deleteDropboxFile(
              item.dropboxFileId,
              dropboxToken,
              sessionId,
              sessionRefreshToken,
            );
            sendProgress(index, "Deleted from Dropbox", videoId);
            break;

          case "move":
            if (item.completedFolderId) {
              await moveDropboxFile(
                item.dropboxFileId,
                item.completedFolderId,
                dropboxToken,
                sessionId,
                sessionRefreshToken,
              );
              sendProgress(index, `Moved to folder`, videoId);
            } else {
              console.warn(
                `[WORKER] Move action requested but no completedFolderId provided`,
              );
            }
            break;
        }
      } catch (actionError: any) {
        console.error(
          `[WORKER] Dropbox post-upload action failed for video ${index}:`,
          actionError,
        );
        // Don't fail the upload - action is optional
      }
    }

    return { success: true, videoId };
  } catch (error: any) {
    let errorMessage =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Unknown error";

    // Improve error messages for common cases
    if (
      errorMessage.includes("File not found") ||
      errorMessage.includes("404")
    ) {
      errorMessage = `Video file not found or inaccessible`;
    } else if (errorMessage.includes("Failed to download Drive file")) {
      errorMessage = `Drive file not found or access denied`;
    } else if (errorMessage.includes("Failed to download Dropbox file")) {
      errorMessage = `Dropbox file not found or access denied`;
    } else if (errorMessage.includes("Dropbox token required")) {
      errorMessage = `Dropbox authentication required - please reconnect Dropbox`;
    } else if (errorMessage.includes("No valid video source found")) {
      errorMessage = `No video source available (missing drive_file_id, dropbox_file_id, video_url, or file)`;
    } else if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("ETIMEDOUT")
    ) {
      errorMessage = `Upload timeout - video may be too large or connection too slow`;
    }

    console.error(
      `[WORKER] Upload failed for video ${index + 1} ("${item.title || "Untitled"}"):`,
      errorMessage,
    );
    console.log(`[WORKER] Continuing with remaining videos...`);
    return { success: false, error: errorMessage };
  }
}

/** Delay between starting each Dropbox-backed task to avoid rate limits (no parallel Dropbox calls). */
const DROPBOX_TASK_STAGGER_MS = 5000;

/**
 * Process a batch of uploads.
 * When any task uses Dropbox (video or thumbnail), process sequentially to avoid
 * bombarding Dropbox with simultaneous requests (429). Otherwise process in parallel.
 */
async function processBatch(
  youtube: ReturnType<typeof google.youtube>,
  batch: UploadTask[],
  sendProgress: (
    index: number,
    status: string,
    videoId?: string,
    error?: string,
  ) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>,
  dropboxToken: string | undefined,
  sessionId: string | undefined,
  sessionRefreshToken: string | null | undefined,
  jobId: string,
): Promise<void> {
  const usesDropbox = batch.some(
    (t) => t.item.dropboxFileId || t.item.dropboxThumbnailId,
  );

  let results: PromiseSettledResult<{
    success: boolean;
    videoId?: string;
    error?: string;
  }>[];

  if (usesDropbox) {
    // Sequential: one video at a time to avoid Dropbox 429 (no simultaneous requests).
    results = [];
    for (let i = 0; i < batch.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, DROPBOX_TASK_STAGGER_MS));
      }
      const task = batch[i];
      try {
        const value = await uploadVideo(
          youtube,
          task,
          sendProgress,
          oAuthClient,
          dropboxToken,
          sessionId,
          sessionRefreshToken,
        );
        results.push({ status: "fulfilled", value });
      } catch (reason) {
        results.push({ status: "rejected", reason });
      }
    }
  } else {
    results = await Promise.allSettled(
      batch.map((task) =>
        uploadVideo(
          youtube,
          task,
          sendProgress,
          oAuthClient,
          dropboxToken,
          sessionId,
          sessionRefreshToken,
        ),
      ),
    );
  }

  const batchResults = { success: 0, failed: 0 };

  results.forEach((result, i) => {
    const task = batch[i];
    if (result.status === "fulfilled") {
      if (result.value.success) {
        batchResults.success++;
        const videoId = result.value.videoId;
        sendProgress(task.index, `Completed: ${videoId}`, videoId);
        if (videoId) {
          appendUploadedVideo({
            videoId,
            title: task.item.title || `Video ${task.index + 1}`,
            jobId,
            uploadedAt: new Date().toISOString(),
          });
        }
      } else {
        batchResults.failed++;
        sendProgress(
          task.index,
          `Failed: ${result.value.error}`,
          undefined,
          result.value.error,
        );
      }
    } else {
      batchResults.failed++;
      const reason = (result as PromiseRejectedResult).reason;
      const message = reason?.message ?? String(reason);
      sendProgress(task.index, `Failed: ${message}`, undefined, message);
    }
  });

  console.log(
    `[WORKER] Batch completed: ${batchResults.success} succeeded, ${batchResults.failed} failed`,
  );
}

/**
 * Process a single bulk upload job
 *
 * IMPORTANT: videosPerDay controls how many videos are UPLOADED per day (YouTube's daily limit)
 * NOT how many are scheduled. Videos are uploaded gradually over multiple days.
 *
 * - If videosPerDay is set, only upload that many videos TODAY, then wait for tomorrow
 * - If a video has publishAt from the sheet, use it for YouTube's scheduled publish feature
 * - If no publishAt, upload as public immediately
 */
async function processBulkJob(jobId: string): Promise<void> {
  const { getBulkQueueItem } = await import("./lib/bulk-queue");
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
  (job.progress || []).forEach((p) => {
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
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    batches.push(tasks.slice(i, i + BATCH_SIZE));
  }

  // Track progress in memory to avoid race conditions with disk writes
  let localProgress = [...(job.progress || [])];

  const sendProgress = (
    index: number,
    status: string,
    videoId?: string,
    error?: string,
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
      for (let i = 0; i < validTasks.length; i += BATCH_SIZE) {
        batches.push(validTasks.slice(i, i + BATCH_SIZE));
      }
    }

    // Process today's batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `[WORKER] Uploading batch ${i + 1}/${batches.length} (${batch.length} videos)`,
      );
      await processBatch(
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

/**
 * Get next job that needs processing (pending or processing with more batches)
 */
function getNextJobToProcess(): { id: string; status: string } | null {
  const queue = getBulkQueue();
  const now = new Date();
  // Use UTC for day calculations (consistent with processBulkJob)
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
  );

  for (const job of queue) {
    if (job.status === "pending") {
      return { id: job.id, status: job.status };
    }

    // Check "processing" jobs that might have more batches for today
    if (
      job.status === "processing" &&
      job.videosPerDay &&
      job.videosPerDay > 0
    ) {
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
      );

      const daysSinceStart = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate today's batch range
      const todayStartIndex = daysSinceStart * job.videosPerDay;
      const todayEndIndex = Math.min(
        todayStartIndex + job.videosPerDay,
        job.items.length,
      );

      // Check if there are unprocessed videos in today's batch
      const completedIndices = new Set<number>();
      const failedIndices = new Set<number>();
      (job.progress || []).forEach((p) => {
        if (p && typeof p.index === "number") {
          if (
            p.videoId ||
            (p.status &&
              (p.status.includes("Uploaded") || p.status.includes("Scheduled")))
          ) {
            completedIndices.add(p.index);
          } else if (p.status && p.status.includes("Failed")) {
            failedIndices.add(p.index);
          }
        }
      });

      let hasPendingToday = false;
      for (
        let i = todayStartIndex;
        i < todayEndIndex && i < job.items.length;
        i++
      ) {
        if (!completedIndices.has(i) && !failedIndices.has(i)) {
          hasPendingToday = true;
          break;
        }
      }

      if (hasPendingToday) {
        return { id: job.id, status: job.status };
      }
    }
  }

  return null;
}

/**
 * Main worker loop
 */
async function workerLoop(): Promise<void> {
  let jobId: string | undefined;
  try {
    const jobToProcess = getNextJobToProcess();
    jobId = jobToProcess?.id;
    writeHeartbeat(jobId);
    if (jobToProcess) {
      await processBulkJob(jobToProcess.id);
    }
  } catch (error: unknown) {
    workerLog.error("Error in worker loop", {
      error: error instanceof Error ? error.message : String(error),
      jobId,
    });
  }

  setTimeout(workerLoop, WORKER_INTERVAL);
}

// Start worker
workerLog.info("Starting bulk upload worker", {
  intervalSeconds: WORKER_INTERVAL / 1000,
});
workerLoop();

process.on("SIGINT", () => {
  workerLog.info("Shutting down gracefully (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", () => {
  workerLog.info("Shutting down gracefully (SIGTERM)");
  process.exit(0);
});
