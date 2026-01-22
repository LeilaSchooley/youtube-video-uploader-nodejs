#!/usr/bin/env node

/**
 * Background worker for processing bulk uploads
 * This worker processes uploads from the bulk queue asynchronously
 */

import { getBulkQueue, getNextPendingBulkItem, markBulkAsProcessing, markBulkAsCompleted, markBulkAsFailed, updateBulkProgress } from "./lib/bulk-queue";
import { getSession, loadSessions } from "./lib/session";
import { getOAuthClient } from "./lib/auth";
import { google } from "googleapis";
import { fetchFileAsStream, isValidUrl } from "./lib/url-stream";
import { downloadDriveFile, isDriveFileId, renameDriveFile, moveDriveFile, deleteDriveFile, getDriveFileMetadata } from "./lib/drive";
import { Readable } from "stream";
import fs from "fs";

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
  };
}

/**
 * Get video stream from file, URL, or Drive
 */
async function getVideoStream(task: UploadTask, oAuthClient: ReturnType<typeof getOAuthClient>): Promise<Readable> {
  const { item } = task;

  // Priority: Drive > URL > File
  if (item.driveFileId && isDriveFileId(item.driveFileId)) {
    return await downloadDriveFile(item.driveFileId, oAuthClient);
  }

  // Handle URL-based upload
  if (item.url && isValidUrl(item.url)) {
    return await fetchFileAsStream(item.url, {
      timeout: item.timeout || 10 * 60 * 1000, // 10 minutes default for URLs
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
async function getThumbnailStream(task: UploadTask, oAuthClient: ReturnType<typeof getOAuthClient>): Promise<Readable | null> {
  const { item } = task;

  // Priority: Drive > URL > File
  if (item.driveThumbnailId && isDriveFileId(item.driveThumbnailId)) {
    return await downloadDriveFile(item.driveThumbnailId, oAuthClient);
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
  sendProgress: (index: number, status: string, videoId?: string, error?: string) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>
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

    if (item.publishDate) {
      requestBody.status.publishAt = new Date(item.publishDate).toISOString();
    }

    // Determine video source for status message
    let sourceInfo = "";
    if (item.driveFileId) {
      sourceInfo = "from Google Drive";
    } else if (item.url) {
      sourceInfo = "from URL";
    } else if (item.file) {
      sourceInfo = `file: ${item.file.name}`;
    }
    
    sendProgress(index, `Fetching video ${sourceInfo}...`);

    // Get video stream
    const videoStream = await getVideoStream(task, oAuthClient);

    sendProgress(index, `Uploading "${title}" to YouTube...`);

    const uploadStartTime = Date.now();
    const result = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody,
      media: { body: videoStream },
    });

    const videoId = result.data.id;
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (!videoId) {
      return {
        success: false,
        error: "Upload succeeded but no video ID returned",
      };
    }

    sendProgress(index, `Uploaded successfully (${uploadDuration.toFixed(1)}s)`, videoId);

    // Upload thumbnail if available
    const thumbnailStream = await getThumbnailStream(task, oAuthClient);
    if (thumbnailStream && videoId) {
      sendProgress(index, "Uploading thumbnail...", videoId);
      try {
        await youtube.thumbnails.set({
          videoId: videoId,
          media: { body: thumbnailStream },
        });
        sendProgress(index, "Thumbnail uploaded", videoId);
      } catch (thumbError: any) {
        console.error(`[WORKER] Thumbnail upload failed for video ${index}:`, thumbError);
        // Don't fail the whole upload
      }
    }

    // Post-upload actions for Drive files
    if (item.driveFileId && videoId && item.postUploadAction && item.postUploadAction !== "none") {
      try {
        switch (item.postUploadAction.toLowerCase()) {
          case "rename":
            const fileMetadata = await getDriveFileMetadata(item.driveFileId, oAuthClient);
            const extension = fileMetadata.name.split('.').pop() || 'mp4';
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
              await moveDriveFile(item.driveFileId, item.completedFolderId, oAuthClient);
              sendProgress(index, `Moved to folder`, videoId);
            } else {
              console.warn(`[WORKER] Move action requested but no completedFolderId provided`);
            }
            break;
        }
      } catch (actionError: any) {
        console.error(`[WORKER] Post-upload action failed for video ${index}:`, actionError);
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
    if (errorMessage.includes("File not found") || errorMessage.includes("404")) {
      errorMessage = `Video file not found or inaccessible`;
    } else if (errorMessage.includes("Failed to download Drive file")) {
      errorMessage = `Drive file not found or access denied`;
    } else if (errorMessage.includes("No valid video source found")) {
      errorMessage = `No video source available (missing drive_file_id, video_url, or file)`;
    } else if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      errorMessage = `Upload timeout - video may be too large or connection too slow`;
    }

    console.error(`[WORKER] Upload failed for video ${index + 1} ("${item.title || 'Untitled'}"):`, errorMessage);
    console.log(`[WORKER] Continuing with remaining videos...`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Process a batch of uploads
 */
async function processBatch(
  youtube: ReturnType<typeof google.youtube>,
  batch: UploadTask[],
  sendProgress: (index: number, status: string, videoId?: string, error?: string) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>
): Promise<void> {
  const results = await Promise.allSettled(
    batch.map((task) => uploadVideo(youtube, task, sendProgress, oAuthClient))
  );

  const batchResults = {
    success: 0,
    failed: 0,
  };

  results.forEach((result, i) => {
    const task = batch[i];
    if (result.status === "fulfilled") {
      if (result.value.success) {
        batchResults.success++;
        sendProgress(
          task.index,
          `Completed: ${result.value.videoId}`,
          result.value.videoId
        );
      } else {
        batchResults.failed++;
        sendProgress(task.index, `Failed: ${result.value.error}`, undefined, result.value.error);
      }
    } else {
      batchResults.failed++;
      sendProgress(
        task.index,
        `Failed: ${result.reason?.message || "Unknown error"}`,
        undefined,
        result.reason?.message || "Unknown error"
      );
    }
  });

  console.log(`[WORKER] Batch completed: ${batchResults.success} succeeded, ${batchResults.failed} failed`);
}

/**
 * Process a single bulk upload job
 */
async function processBulkJob(jobId: string): Promise<void> {
  const { getBulkQueueItem } = await import("./lib/bulk-queue");
  const job = getBulkQueueItem(jobId);

  if (!job) {
    console.error(`[WORKER] Job ${jobId} not found`);
    return;
  }

  if (job.status !== "pending") {
    console.log(`[WORKER] Job ${jobId} is not pending (status: ${job.status})`);
    return;
  }

  markBulkAsProcessing(jobId);
  console.log(`[WORKER] Processing job ${jobId} with ${job.items.length} items`);

  // Get session and authenticate
  // Reload sessions from disk in case they were updated (e.g., after logout but session kept for active jobs)
  loadSessions();
  let session = getSession(job.sessionId);
  
  // If session not found, try reloading and check again
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

  // Calculate scheduled publish dates if videosPerDay is set
  let scheduledDates: Date[] = [];
  if (job.videosPerDay && job.videosPerDay > 0) {
    // Use startDate if provided, otherwise use today
    const startDate = job.startDate ? new Date(job.startDate) : new Date();
    startDate.setHours(12, 0, 0, 0); // Set to noon for consistency
    
    for (let i = 0; i < job.items.length; i++) {
      const dayIndex = Math.floor(i / job.videosPerDay);
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(startDate.getDate() + dayIndex);
      scheduledDates.push(scheduledDate);
    }
  }

  // Create upload tasks with scheduled dates
  const tasks: UploadTask[] = job.items.map((item, index) => {
    const taskItem = { ...item };
    
    // Priority: Use publishDate from item if it exists (respects sheet's scheduleTime/publishAt)
    // Otherwise, if videosPerDay is set, use calculated scheduled date
    if (item.publishDate) {
      // Item already has a publishDate from the sheet - use it as-is
      // Don't override it
    } else if (job.videosPerDay && job.videosPerDay > 0 && scheduledDates[index]) {
      // No publishDate in item, but videosPerDay is set - use calculated date
      taskItem.publishDate = scheduledDates[index].toISOString();
      // Set privacy to private for scheduled videos (YouTube requirement - scheduled videos must be private)
      if (!taskItem.privacyStatus) {
        taskItem.privacyStatus = "private"; // Scheduled videos must be private per YouTube API
      }
    }
    
    return {
      index,
      item: taskItem,
    };
  });

  // Process in batches
  const batches: UploadTask[][] = [];
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    batches.push(tasks.slice(i, i + BATCH_SIZE));
  }

  const sendProgress = (
    index: number,
    status: string,
    videoId?: string,
    error?: string
  ) => {
    const currentProgress = [...(job.progress || [])];
    const item = job.items[index];
    const title = item?.title || `Video ${index + 1}`;
    // Include title in status for better visibility
    const statusWithTitle = status.includes(title) ? status : `${title}: ${status}`;
    currentProgress[index] = { index, status: statusWithTitle, videoId, error, title };
    updateBulkProgress(jobId, currentProgress);
  };

  try {
    // Validate that all items have a video source before processing
    const itemsWithoutSource = job.items.filter(
      (item) => !item.driveFileId && !item.url && !item.file
    );
    
    if (itemsWithoutSource.length > 0) {
      const errorMsg = `${itemsWithoutSource.length} item(s) missing video source (need video_url, drive_file_id, or video file)`;
      markBulkAsFailed(jobId, errorMsg);
      console.error(`[WORKER] Job ${jobId} failed: ${errorMsg}`);
      
      // Mark all items without sources as failed
      itemsWithoutSource.forEach((item, idx) => {
        const itemIndex = job.items.indexOf(item);
        if (itemIndex !== -1) {
          sendProgress(itemIndex, `Failed: Missing video source`, undefined, "No video source found");
        }
      });
      return;
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `[WORKER] Processing batch ${i + 1}/${batches.length} (${batch.length} items)`
      );
      await processBatch(youtube, batch, sendProgress, oAuthClient);
    }

    // Check final status and provide summary
    const finalJob = getBulkQueueItem(jobId);
    if (finalJob) {
      const totalItems = finalJob.items.length;
      const progressItems = finalJob.progress || [];
      const successfulItems = progressItems.filter(
        (p) => p.videoId && !p.error
      ).length;
      const failedItems = progressItems.filter((p) => p.error).length;
      
      console.log(`[WORKER] Job ${jobId} summary: ${successfulItems}/${totalItems} succeeded, ${failedItems} failed`);
      
      if (successfulItems === 0 && failedItems > 0) {
        // All items failed
        markBulkAsFailed(jobId, `All ${failedItems} item(s) failed to upload`);
        console.error(`[WORKER] Job ${jobId} failed: All items failed`);
        return;
      }
      
      if (successfulItems === 0 && progressItems.length === 0) {
        // No progress was made at all
        markBulkAsFailed(jobId, "No items were processed");
        console.error(`[WORKER] Job ${jobId} failed: No items processed`);
        return;
      }

      // Job completed (may have some failures, but at least one succeeded)
      if (failedItems > 0) {
        console.warn(`[WORKER] Job ${jobId} completed with ${failedItems} failure(s) - check individual items for details`);
      }
    }

    markBulkAsCompleted(jobId);
    console.log(`[WORKER] Job ${jobId} completed successfully`);
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";
    markBulkAsFailed(jobId, errorMessage);
    console.error(`[WORKER] Job ${jobId} failed:`, errorMessage);
  }
}

/**
 * Main worker loop
 */
async function workerLoop(): Promise<void> {
  try {
    const pendingJob = getNextPendingBulkItem();
    if (pendingJob) {
      await processBulkJob(pendingJob.id);
    }
  } catch (error: any) {
    console.error("[WORKER] Error in worker loop:", error);
  }

  // Schedule next check
  setTimeout(workerLoop, WORKER_INTERVAL);
}

// Start worker
console.log("[WORKER] Starting bulk upload worker...");
console.log(`[WORKER] Checking for jobs every ${WORKER_INTERVAL / 1000} seconds`);
workerLoop();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("[WORKER] Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[WORKER] Shutting down gracefully...");
  process.exit(0);
});

