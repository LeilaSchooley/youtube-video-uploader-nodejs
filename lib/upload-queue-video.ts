import { google } from "googleapis";
import { Readable } from "stream";
import { fetchFileAsStream, isValidUrl } from "@/lib/url-stream";
import {
  downloadDriveFile,
  getDriveFileMetadata,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
} from "@/lib/drive";
import {
  sanitizeYoutubeTitle,
  sanitizeYoutubeDescription,
} from "@/lib/youtube-utils";
import { parseDate } from "@/lib/utils";
import { getOAuthClient } from "@/lib/auth";
import type { BatchProgress, VideoUploadTask } from "@/lib/upload-queue-types";

type Youtube = ReturnType<typeof google.youtube>;
type OAuthClient = ReturnType<typeof getOAuthClient>;
type ProgressSend = (data: unknown) => void;

/**
 * Upload a single video to YouTube (used by upload-queue batch processing).
 */
export async function uploadQueueVideo(
  youtube: Youtube,
  task: VideoUploadTask,
  sendProgress: ProgressSend,
  oAuthClient: OAuthClient,
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const { row, videoFile, thumbnailFile } = task;
  const { youtube_title, youtube_description, scheduleTime, privacyStatus } =
    row;

  if (!youtube_title || !youtube_description) {
    return {
      success: false,
      error: "Missing required fields: youtube_title or youtube_description",
    };
  }

  if (!videoFile && !task.videoUrl && !task.driveFileId) {
    return {
      success: false,
      error: "Video file, URL, or Drive file ID not found",
    };
  }

  try {
    let publishDate: Date | null = null;
    if (scheduleTime) {
      publishDate = parseDate(scheduleTime);
      if (!publishDate) {
        return {
          success: false,
          error: "Invalid scheduleTime format",
        };
      }
    }

    const finalPrivacyStatus = privacyStatus || "public";
    if (!["public", "private", "unlisted"].includes(finalPrivacyStatus)) {
      return {
        success: false,
        error: "Invalid privacyStatus",
      };
    }

    const uploadPrivacyStatus = publishDate ? "private" : finalPrivacyStatus;

    const requestBody: {
      snippet: { title: string; description: string };
      status: {
        privacyStatus: string;
        publishAt?: string;
        selfDeclaredMadeForKids?: boolean;
      };
    } = {
      snippet: {
        title: sanitizeYoutubeTitle(youtube_title),
        description: sanitizeYoutubeDescription(youtube_description),
      },
      status: {
        privacyStatus: uploadPrivacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    if (publishDate) {
      requestBody.status.publishAt = publishDate.toISOString();
    }

    sendProgress({
      type: "video_upload_start",
      index: task.index,
      title: youtube_title.substring(0, 50),
    });

    let videoStream: Readable;

    if (task.driveFileId) {
      sendProgress({
        type: "video_fetch_start",
        index: task.index,
        title: youtube_title.substring(0, 50),
      });
      videoStream = await downloadDriveFile(task.driveFileId, oAuthClient);
    } else if (task.videoUrl && isValidUrl(task.videoUrl)) {
      sendProgress({
        type: "video_fetch_start",
        index: task.index,
        title: youtube_title.substring(0, 50),
      });
      videoStream = await fetchFileAsStream(task.videoUrl, {
        timeout: task.timeout || 10 * 60 * 1000,
        headers: task.authHeaders || {},
      });
    } else if (videoFile) {
      const videoBytes = await videoFile.arrayBuffer();
      const videoBuffer = Buffer.from(videoBytes);
      videoStream = Readable.from(videoBuffer);
    } else {
      return {
        success: false,
        error: "No valid video source found",
      };
    }

    const uploadStartTime = Date.now();
    const resultVideoUpload = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody,
      media: { body: videoStream },
    });

    const videoId = resultVideoUpload.data.id || undefined;
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (!videoId) {
      return {
        success: false,
        error: "Upload succeeded but no video ID returned",
      };
    }

    sendProgress({
      type: "video_upload_success",
      index: task.index,
      title: youtube_title.substring(0, 50),
      videoId,
      duration: uploadDuration,
    });

    if (
      videoId &&
      (thumbnailFile || task.thumbnailUrl || task.driveThumbnailId)
    ) {
      sendProgress({
        type: "thumbnail_upload_start",
        index: task.index,
        videoId,
      });

      try {
        let thumbnailStream: Readable;

        if (task.driveThumbnailId) {
          thumbnailStream = await downloadDriveFile(
            task.driveThumbnailId,
            oAuthClient,
          );
        } else if (task.thumbnailUrl && isValidUrl(task.thumbnailUrl)) {
          thumbnailStream = await fetchFileAsStream(task.thumbnailUrl, {
            timeout: 60000,
          });
        } else if (thumbnailFile) {
          const thumbnailBytes = await thumbnailFile.arrayBuffer();
          const thumbnailBuffer = Buffer.from(thumbnailBytes);
          thumbnailStream = Readable.from(thumbnailBuffer);
        } else {
          throw new Error("No valid thumbnail source");
        }

        await youtube.thumbnails.set({
          videoId: videoId,
          media: { body: thumbnailStream },
        });

        sendProgress({
          type: "thumbnail_upload_success",
          index: task.index,
          videoId,
        });
      } catch (thumbError: unknown) {
        const te = thumbError as { message?: string };
        console.error(
          `[UPLOAD-QUEUE] Thumbnail upload failed for video ${task.index}:`,
          thumbError,
        );
        sendProgress({
          type: "thumbnail_upload_failed",
          index: task.index,
          videoId,
          error: te?.message || "Unknown error",
        });
      }
    }

    if (
      uploadPrivacyStatus === "private" &&
      finalPrivacyStatus !== "private" &&
      videoId &&
      publishDate
    ) {
      try {
        await youtube.videos.update({
          part: ["status"],
          requestBody: {
            id: videoId,
            status: {
              privacyStatus: finalPrivacyStatus,
              publishAt: requestBody.status.publishAt,
            },
          },
        });
      } catch (updateError: unknown) {
        console.error(
          `[UPLOAD-QUEUE] Privacy update failed for video ${task.index}:`,
          updateError,
        );
      }
    }

    if (
      task.driveFileId &&
      videoId &&
      task.postUploadAction &&
      task.postUploadAction !== "none"
    ) {
      try {
        switch (task.postUploadAction.toLowerCase()) {
          case "rename": {
            const fileMetadata = await getDriveFileMetadata(
              task.driveFileId,
              oAuthClient,
            );
            const extension = fileMetadata.name.split(".").pop() || "mp4";
            const newName = `${videoId}.${extension}`;
            await renameDriveFile(task.driveFileId, newName, oAuthClient);
            sendProgress({
              type: "post_upload_action",
              index: task.index,
              videoId,
              action: "renamed",
              message: `Renamed to ${newName}`,
            });
            break;
          }

          case "delete":
            await deleteDriveFile(task.driveFileId, oAuthClient);
            sendProgress({
              type: "post_upload_action",
              index: task.index,
              videoId,
              action: "deleted",
              message: "File deleted from Drive",
            });
            break;

          case "move":
            if (task.completedFolderId) {
              await moveDriveFile(
                task.driveFileId,
                task.completedFolderId,
                oAuthClient,
              );
              sendProgress({
                type: "post_upload_action",
                index: task.index,
                videoId,
                action: "moved",
                message: `Moved to folder ${task.completedFolderId}`,
              });
            } else {
              console.warn(
                `[UPLOAD-QUEUE] Move action requested but no completed_folder_id provided`,
              );
            }
            break;
        }
      } catch (actionError: unknown) {
        const ae = actionError as { message?: string };
        console.error(
          `[UPLOAD-QUEUE] Post-upload action failed for video ${task.index}:`,
          actionError,
        );
        sendProgress({
          type: "post_upload_action_failed",
          index: task.index,
          videoId,
          error: ae?.message || "Unknown error",
        });
      }
    }

    return { success: true, videoId };
  } catch (error: unknown) {
    const err = error as {
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    const errorMessage =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Unknown error";

    sendProgress({
      type: "video_upload_failed",
      index: task.index,
      title: youtube_title?.substring(0, 50) || "Unknown",
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Process one batch of upload-queue tasks in parallel.
 */
export async function uploadQueueProcessBatch(
  youtube: Youtube,
  batch: VideoUploadTask[],
  batchNumber: number,
  totalBatches: number,
  sendProgress: ProgressSend,
  oAuthClient: OAuthClient,
): Promise<BatchProgress> {
  sendProgress({
    type: "batch_start",
    batchNumber,
    totalBatches,
    batchSize: batch.length,
  });

  const results = await Promise.allSettled(
    batch.map((task) =>
      uploadQueueVideo(youtube, task, sendProgress, oAuthClient),
    ),
  );

  const completed = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = results.filter(
    (r) =>
      r.status === "rejected" || (r.status === "fulfilled" && !r.value.success),
  ).length;

  const currentBatch = batch.map((task, i) => {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.success) {
      return {
        index: task.index,
        title: task.row.youtube_title?.substring(0, 50) || "Unknown",
        status: "success" as const,
        videoId: result.value.videoId,
      };
    }
    const errMsg =
      result.status === "fulfilled"
        ? result.value.error
        : result.reason instanceof Error
          ? result.reason.message
          : "Unknown error";
    return {
      index: task.index,
      title: task.row.youtube_title?.substring(0, 50) || "Unknown",
      status: "failed" as const,
      error: errMsg,
    };
  });

  sendProgress({
    type: "batch_complete",
    batchNumber,
    totalBatches,
    completed,
    failed,
    total: batch.length,
    currentBatch,
  });

  return {
    batchNumber,
    totalBatches,
    batchSize: batch.length,
    completed,
    failed,
    total: batch.length,
    currentBatch,
  };
}
