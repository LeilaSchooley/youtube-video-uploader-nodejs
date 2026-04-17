import { Readable } from "stream";
import fs from "fs";
import { google } from "googleapis";
import { getOAuthClient } from "./auth";
import {
  downloadDriveFile,
  isDriveFileId,
  getDriveFileMetadata,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
} from "./drive";
import {
  downloadDropboxFile,
  isDropboxPath,
  renameDropboxFile,
  moveDropboxFile,
  deleteDropboxFile,
  getDropboxFileMetadata,
} from "./dropbox";
import { fetchFileAsStream, isValidUrl } from "./url-stream";
import { withRetry } from "./youtube-retry";
import { workerLog } from "./worker-logger";
import {
  sanitizeYoutubeTitle,
  sanitizeYoutubeDescription,
} from "./youtube-utils";
import { getVideoDurationSeconds } from "./video-duration";
import { appendUploadedVideo } from "./uploaded-videos";

export interface UploadTask {
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
export async function workerUploadVideo(
  youtube: ReturnType<typeof google.youtube>,
  task: UploadTask,
  sendProgress: (
    index: number,
    status: string,
    videoId?: string,
    error?: string,
    duration?: number,
  ) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>,
  dropboxToken?: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const { index, item } = task;
  let videoDuration: number | null = null;

  try {
    // Get video duration from local file path when available (requires ffprobe)
    if (item.file?.path) {
      videoDuration = await getVideoDurationSeconds(item.file.path);
    }

    // Get title and description; sanitize for YouTube limits (100 title, 5000 description)
    const rawTitle = item.title || `Video ${index + 1}`;
    const rawDesc = item.description || `Uploaded video ${index + 1}`;
    const title = sanitizeYoutubeTitle(rawTitle);
    const description = sanitizeYoutubeDescription(rawDesc);
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
      undefined,
      videoDuration ?? undefined,
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
export async function workerProcessBatch(
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
        const value = await workerUploadVideo(
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
        workerUploadVideo(
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
