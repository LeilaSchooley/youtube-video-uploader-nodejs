import { NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { google } from "googleapis";
import { Readable } from "stream";
import csvParser from "csv-parser";
import { parseDate } from "@/lib/utils";
import fs from "fs";
import path from "path";
import { fetchFileAsStream, isValidUrl } from "@/lib/url-stream";
import {
  downloadDriveFile,
  isDriveFileId,
  getDriveFileMetadata,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
} from "@/lib/drive";
import {
  sanitizeYoutubeTitle,
  sanitizeYoutubeDescription,
} from "@/lib/youtube-utils";
import { getQueue } from "@/lib/queue";
import { getBulkQueue } from "@/lib/bulk-queue";
import { readHeartbeat } from "@/lib/worker-health";
import type { QueueItem } from "@/lib/queue";
import type { BulkUploadItem } from "@/lib/bulk-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 minutes for large batches
export const runtime = "nodejs";

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  video_name?: string; // Primary: explicit video filename for matching
  thumbnail_name?: string; // Primary: explicit thumbnail filename for matching
  thumbnail_path?: string; // Fallback: extract filename from path
  path?: string; // Fallback: extract filename from path
  video_url?: string; // URL to video file
  thumbnail_url?: string; // URL to thumbnail file
  drive_file_id?: string; // Google Drive file ID for video
  drive_thumbnail_id?: string; // Google Drive file ID for thumbnail
  url_auth_headers?: string; // JSON string of auth headers
  url_timeout?: string; // Timeout in milliseconds
  scheduleTime?: string;
  privacyStatus?: string;
  post_upload_action?: string; // "rename", "delete", "move", or "none"
  completed_folder_id?: string; // Drive folder ID for move action
}

interface VideoUploadTask {
  index: number;
  row: CSVRow;
  videoFile: File | null;
  thumbnailFile: File | null;
  videoUrl?: string;
  thumbnailUrl?: string;
  driveFileId?: string;
  driveThumbnailId?: string;
  authHeaders?: Record<string, string>;
  timeout?: number;
  postUploadAction?: string;
  completedFolderId?: string;
}

interface BatchProgress {
  batchNumber: number;
  totalBatches: number;
  batchSize: number;
  completed: number;
  failed: number;
  total: number;
  currentBatch: Array<{
    index: number;
    title: string;
    status: "uploading" | "success" | "failed";
    videoId?: string;
    error?: string;
  }>;
}

/**
 * Stream progress updates as Server-Sent Events
 */
function createProgressStream(
  callback: (send: (data: any) => void) => Promise<void>,
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        await callback(send);
        send({ type: "complete" });
      } catch (error: any) {
        send({
          type: "error",
          error: error?.message || "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Upload a single video to YouTube
 */
async function uploadVideo(
  youtube: ReturnType<typeof google.youtube>,
  task: VideoUploadTask,
  sendProgress: (data: any) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>,
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

  // Check if we have a video source (file, URL, or Drive)
  if (!videoFile && !task.videoUrl && !task.driveFileId) {
    return {
      success: false,
      error: "Video file, URL, or Drive file ID not found",
    };
  }

  try {
    // Determine publish date
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

    // Upload as private if scheduling, otherwise use finalPrivacyStatus
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
        selfDeclaredMadeForKids: false, // Default to false (not made for kids)
      },
    };

    if (publishDate) {
      requestBody.status.publishAt = publishDate.toISOString();
    }

    // Stream video file or URL directly to YouTube
    sendProgress({
      type: "video_upload_start",
      index: task.index,
      title: youtube_title.substring(0, 50),
    });

    let videoStream: Readable;

    // Priority: Drive > URL > File
    if (task.driveFileId) {
      // Handle Drive-based upload
      sendProgress({
        type: "video_fetch_start",
        index: task.index,
        title: youtube_title.substring(0, 50),
      });
      videoStream = await downloadDriveFile(task.driveFileId, oAuthClient);
    } else if (task.videoUrl && isValidUrl(task.videoUrl)) {
      // Handle URL-based upload
      sendProgress({
        type: "video_fetch_start",
        index: task.index,
        title: youtube_title.substring(0, 50),
      });
      videoStream = await fetchFileAsStream(task.videoUrl, {
        timeout: task.timeout || 10 * 60 * 1000, // 10 minutes default
        headers: task.authHeaders || {},
      });
    } else if (videoFile) {
      // Handle file-based upload
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

    // Upload thumbnail if provided (file, URL, or Drive)
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

        // Priority: Drive > URL > File
        if (task.driveThumbnailId) {
          thumbnailStream = await downloadDriveFile(
            task.driveThumbnailId,
            oAuthClient,
          );
        } else if (task.thumbnailUrl && isValidUrl(task.thumbnailUrl)) {
          thumbnailStream = await fetchFileAsStream(task.thumbnailUrl, {
            timeout: 60000, // 1 minute for thumbnails
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
      } catch (thumbError: any) {
        console.error(
          `[UPLOAD-QUEUE] Thumbnail upload failed for video ${task.index}:`,
          thumbError,
        );
        // Don't fail the whole upload if thumbnail fails
        sendProgress({
          type: "thumbnail_upload_failed",
          index: task.index,
          videoId,
          error: thumbError?.message || "Unknown error",
        });
      }
    }

    // Update privacy status if needed (only if we uploaded as private for scheduling)
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
      } catch (updateError: any) {
        console.error(
          `[UPLOAD-QUEUE] Privacy update failed for video ${task.index}:`,
          updateError,
        );
        // Don't fail - video is uploaded, just privacy might be wrong
      }
    }

    // Post-upload actions for Drive files
    if (
      task.driveFileId &&
      videoId &&
      task.postUploadAction &&
      task.postUploadAction !== "none"
    ) {
      try {
        switch (task.postUploadAction.toLowerCase()) {
          case "rename":
            // Rename file to video ID for tracking
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
      } catch (actionError: any) {
        console.error(
          `[UPLOAD-QUEUE] Post-upload action failed for video ${task.index}:`,
          actionError,
        );
        // Don't fail the upload - action is optional
        sendProgress({
          type: "post_upload_action_failed",
          index: task.index,
          videoId,
          error: actionError?.message || "Unknown error",
        });
      }
    }

    return { success: true, videoId };
  } catch (error: any) {
    const errorMessage =
      error?.response?.data?.error?.message ||
      error?.message ||
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
 * Process a batch of videos
 */
async function processBatch(
  youtube: ReturnType<typeof google.youtube>,
  batch: VideoUploadTask[],
  batchNumber: number,
  totalBatches: number,
  sendProgress: (data: any) => void,
  oAuthClient: ReturnType<typeof getOAuthClient>,
): Promise<BatchProgress> {
  sendProgress({
    type: "batch_start",
    batchNumber,
    totalBatches,
    batchSize: batch.length,
  });

  const results = await Promise.allSettled(
    batch.map((task) => uploadVideo(youtube, task, sendProgress, oAuthClient)),
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
    } else {
      return {
        index: task.index,
        title: task.row.youtube_title?.substring(0, 50) || "Unknown",
        status: "failed" as const,
        error:
          result.status === "fulfilled"
            ? result.value.error
            : result.reason?.message || "Unknown error",
      };
    }
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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = getSession(sessionId);
  if (!session || !session.authenticated || !session.tokens) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Ensure userId is set on session (for display/queue)
  let userId = session.userId;
  if (!userId) {
    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);
    const oauth2 = google.oauth2({
      version: "v2",
      auth: oAuthClient,
    });
    const userInfo = await oauth2.userinfo.get();
    userId = (userInfo.data.email || userInfo.data.id || undefined) as
      | string
      | undefined;
    session.userId = userId;
    setSession(sessionId, session);
  }

  const formData = await request.formData();
  let csvFile = formData.get("csvFile") as File | null;
  const dropboxCsvPath = formData.get("dropboxCsvPath") as string | null;
  const dropboxSheetName = (formData.get("dropboxSheetName") as string) || undefined;
  const csvSource = formData.get("csvSource") as string | null;
  const batchSize = parseInt((formData.get("batchSize") as string) || "5", 10); // Default: 5 videos per batch

  // Handle Dropbox CSV file
  if (csvSource === "dropbox" && dropboxCsvPath) {
    try {
      const dropboxAccessToken = await getDropboxToken(
        session.dropboxToken,
        session.dropboxRefreshToken,
        sessionId,
      );
      if (!dropboxAccessToken) {
        return new Response(
          JSON.stringify({
            error: "Dropbox not connected. Please connect Dropbox first.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Download file from Dropbox
      const { downloadDropboxFile } = await import("@/lib/dropbox");
      const fileStream = await downloadDropboxFile(
        dropboxCsvPath,
        dropboxAccessToken,
      );

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
      }
      const fileBuffer = Buffer.concat(chunks);

      // Get file name from path
      const fileName = dropboxCsvPath.split("/").pop() || "file.csv";

      // Determine MIME type based on file extension
      const mimeType = fileName.toLowerCase().endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : fileName.toLowerCase().endsWith(".xls")
          ? "application/vnd.ms-excel"
          : "text/csv";

      // Create File object from buffer
      const fileBlob = new Blob([fileBuffer], { type: mimeType });
      csvFile = new File([fileBlob], fileName, { type: mimeType });
    } catch (error: any) {
      console.error(
        "[UPLOAD-QUEUE] Error downloading CSV from Dropbox:",
        error,
      );
      return new Response(
        JSON.stringify({
          error: `Failed to download CSV from Dropbox: ${error.message}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  if (!csvFile) {
    return new Response(
      JSON.stringify({
        error: "No CSV file uploaded or Dropbox file path provided",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get files from server file system (from "All Uploaded Files" section)
  const uploadsDir = path.join(process.cwd(), "uploads");
  const safeUserId = userId ? userId.replace(/[^a-zA-Z0-9._-]/g, "_") : null;

  // Scan for uploaded files on server
  const uploadedFiles: File[] = [];
  const uploadedThumbnails: File[] = [];

  // Helper to scan directory for files
  const scanForFiles = (
    dir: string,
    type: "video" | "thumbnail",
  ): Array<{ name: string; path: string }> => {
    const results: Array<{ name: string; path: string }> = [];
    if (!fs.existsSync(dir)) return results;

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile()) {
            if (type === "video" && /\.(mp4|mov|avi|mkv|webm)$/i.test(item)) {
              results.push({ name: item, path: fullPath });
            } else if (
              type === "thumbnail" &&
              /\.(jpg|jpeg|png|gif|webp)$/i.test(item)
            ) {
              results.push({ name: item, path: fullPath });
            }
          } else if (stats.isDirectory()) {
            // Recursively scan subdirectories
            results.push(...scanForFiles(fullPath, type));
          }
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
    return results;
  };

  // Scan user's upload directories
  const dirsToScan: string[] = [];
  if (safeUserId) {
    dirsToScan.push(path.join(uploadsDir, safeUserId));
  }
  dirsToScan.push(path.join(uploadsDir, sessionId));

  for (const scanDir of dirsToScan) {
    if (!fs.existsSync(scanDir)) continue;

    try {
      const items = fs.readdirSync(scanDir);
      for (const itemName of items) {
        const itemPath = path.join(scanDir, itemName);
        const stats = fs.statSync(itemPath);
        if (!stats.isDirectory()) continue;

        // Check if this is an assets directory (from ZIP upload)
        if (itemName === "assets") {
          const videosDir = path.join(itemPath, "videos");
          const thumbnailsDir = path.join(itemPath, "thumbnails");

          const videoFiles = scanForFiles(videosDir, "video");
          const thumbnailFiles = scanForFiles(thumbnailsDir, "thumbnail");

          // Convert server files to File objects
          for (const fileInfo of videoFiles) {
            try {
              const mimeType = fileInfo.name.match(/\.(mp4)$/i)
                ? "video/mp4"
                : fileInfo.name.match(/\.(mov)$/i)
                  ? "video/quicktime"
                  : fileInfo.name.match(/\.(avi)$/i)
                    ? "video/x-msvideo"
                    : fileInfo.name.match(/\.(mkv)$/i)
                      ? "video/x-matroska"
                      : fileInfo.name.match(/\.(webm)$/i)
                        ? "video/webm"
                        : "video/mp4";

              const fileBuffer = fs.readFileSync(fileInfo.path);
              const fileBlob = new Blob([fileBuffer], { type: mimeType });
              const file = new File([fileBlob], fileInfo.name, {
                type: mimeType,
              });
              uploadedFiles.push(file);
            } catch (error) {
              // Skip files that can't be read
            }
          }

          for (const fileInfo of thumbnailFiles) {
            try {
              const mimeType = fileInfo.name.match(/\.(jpg|jpeg)$/i)
                ? "image/jpeg"
                : fileInfo.name.match(/\.(png)$/i)
                  ? "image/png"
                  : fileInfo.name.match(/\.(gif)$/i)
                    ? "image/gif"
                    : fileInfo.name.match(/\.(webp)$/i)
                      ? "image/webp"
                      : "image/jpeg";

              const fileBuffer = fs.readFileSync(fileInfo.path);
              const fileBlob = new Blob([fileBuffer], { type: mimeType });
              const file = new File([fileBlob], fileInfo.name, {
                type: mimeType,
              });
              uploadedThumbnails.push(file);
            } catch (error) {
              // Skip files that can't be read
            }
          }
          continue; // Skip to next item
        }

        // Otherwise, treat as job directory (legacy structure)
        const videosDir = path.join(itemPath, "videos");
        const thumbnailsDir = path.join(itemPath, "thumbnails");

        const videoFiles = scanForFiles(videosDir, "video");
        const thumbnailFiles = scanForFiles(thumbnailsDir, "thumbnail");

        // Convert server files to File objects
        for (const fileInfo of videoFiles) {
          try {
            const mimeType = fileInfo.name.match(/\.(mp4)$/i)
              ? "video/mp4"
              : fileInfo.name.match(/\.(mov)$/i)
                ? "video/quicktime"
                : fileInfo.name.match(/\.(avi)$/i)
                  ? "video/x-msvideo"
                  : fileInfo.name.match(/\.(mkv)$/i)
                    ? "video/x-matroska"
                    : fileInfo.name.match(/\.(webm)$/i)
                      ? "video/webm"
                      : "video/mp4";

            const fileBuffer = fs.readFileSync(fileInfo.path);
            const fileBlob = new Blob([fileBuffer], { type: mimeType });
            const file = new File([fileBlob], fileInfo.name, {
              type: mimeType,
            });
            uploadedFiles.push(file);
          } catch (error) {
            console.error(
              `[UPLOAD-QUEUE] Failed to read video file ${fileInfo.path}:`,
              error,
            );
          }
        }

        for (const fileInfo of thumbnailFiles) {
          try {
            const mimeType = fileInfo.name.match(/\.(jpg|jpeg)$/i)
              ? "image/jpeg"
              : fileInfo.name.match(/\.png$/i)
                ? "image/png"
                : fileInfo.name.match(/\.gif$/i)
                  ? "image/gif"
                  : fileInfo.name.match(/\.webp$/i)
                    ? "image/webp"
                    : "image/jpeg";

            const fileBuffer = fs.readFileSync(fileInfo.path);
            const fileBlob = new Blob([fileBuffer], { type: mimeType });
            const file = new File([fileBlob], fileInfo.name, {
              type: mimeType,
            });
            uploadedThumbnails.push(file);
          } catch (error) {
            console.error(
              `[UPLOAD-QUEUE] Failed to read thumbnail file ${fileInfo.path}:`,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[UPLOAD-QUEUE] Error scanning directory ${scanDir}:`,
        error,
      );
    }
  }

  console.log(
    `[UPLOAD-QUEUE] Found ${uploadedFiles.length} video(s) and ${uploadedThumbnails.length} thumbnail(s) on server, batch size: ${batchSize}`,
  );

  // Parse CSV or XLSX
  const csvData: CSVRow[] = [];
  const bytes = await csvFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileName = (csvFile.name || "").toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx") as typeof import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetNameToUse =
        dropboxSheetName && workbook.SheetNames.includes(dropboxSheetName)
          ? dropboxSheetName
          : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetNameToUse];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      rows.forEach((row: any) => csvData.push(row as CSVRow));
      console.log(
        `[UPLOAD-QUEUE] XLSX parsed: ${csvData.length} rows from sheet "${sheetNameToUse}"`,
      );
    } catch (parseError: any) {
      return new Response(
        JSON.stringify({
          error: `XLSX parsing failed: ${parseError?.message}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    const csvStream = Readable.from(buffer);
    try {
      await new Promise<void>((resolve, reject) => {
        csvStream
          .pipe(csvParser())
          .on("data", (row: CSVRow) => {
            csvData.push(row);
          })
          .on("end", () => {
            console.log(`[UPLOAD-QUEUE] CSV parsed: ${csvData.length} rows`);
            resolve();
          })
          .on("error", (err) => {
            reject(new Error(`Failed to parse CSV: ${err.message}`));
          });
      });
    } catch (parseError: any) {
      return new Response(
        JSON.stringify({
          error: `CSV parsing failed: ${parseError?.message}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  if (csvData.length === 0) {
    return new Response(JSON.stringify({ error: "CSV file is empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Helper to create File object from server file path
  // Helper functions for filename matching
  const normalizeFilename = (filename: string): string => {
    if (!filename) return "";
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  };

  const extractFilename = (filePath: string): string => {
    if (!filePath) return "";
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.split("/").pop()?.toLowerCase() || "";
  };

  const findMatchingFile = (
    csvFilename: string,
    fileMap: Map<string, File>,
  ): File | null => {
    const lowerCsvFilename = csvFilename.toLowerCase();
    const normalizedCsvFilename = normalizeFilename(csvFilename);

    if (fileMap.has(lowerCsvFilename)) {
      return fileMap.get(lowerCsvFilename) || null;
    }

    if (fileMap.has(normalizedCsvFilename)) {
      return fileMap.get(normalizedCsvFilename) || null;
    }

    for (const [uploadedFilename, file] of Array.from(fileMap.entries())) {
      const normalizedUploaded = normalizeFilename(uploadedFilename);
      const csvCore = normalizedCsvFilename.replace(
        /\.(mp4|mov|avi|mkv)$/i,
        "",
      );
      const uploadedCore = normalizedUploaded.replace(
        /\.(mp4|mov|avi|mkv)$/i,
        "",
      );

      if (
        csvCore === uploadedCore ||
        (csvCore.length > 10 && uploadedCore.includes(csvCore)) ||
        (uploadedCore.length > 10 && csvCore.includes(uploadedCore))
      ) {
        return file || null;
      }
    }

    return null;
  };

  // Create file maps
  const uploadedFilesMap = new Map<string, File>();
  uploadedFiles.forEach((file) => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedFilesMap.set(filename, file);
    if (normalized !== filename) {
      uploadedFilesMap.set(normalized, file);
    }
  });

  const uploadedThumbnailsMap = new Map<string, File>();
  uploadedThumbnails.forEach((file) => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedThumbnailsMap.set(filename, file);
    if (normalized !== filename) {
      uploadedThumbnailsMap.set(normalized, file);
    }
  });

  // Setup YouTube API client
  const oAuthClient = getOAuthClient();
  oAuthClient.setCredentials(session.tokens);
  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });

  // Create upload tasks
  const tasks: VideoUploadTask[] = [];
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];

    // Check if video source is provided
    // Priority: drive_file_id > video_url > path (auto-detect URL/Drive ID)
    let videoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let driveFileId: string | undefined;
    let driveThumbnailId: string | undefined;

    // Check for Drive file ID
    if (row.drive_file_id && isDriveFileId(row.drive_file_id)) {
      driveFileId = row.drive_file_id;
    } else if (row.path && isDriveFileId(row.path)) {
      // Auto-detect: path column contains a Drive file ID
      driveFileId = row.path;
    }

    // Check for video URL (if not Drive)
    if (!driveFileId) {
      if (row.video_url && isValidUrl(row.video_url)) {
        videoUrl = row.video_url;
      } else if (row.path && isValidUrl(row.path)) {
        // Auto-detect: path column contains a URL
        videoUrl = row.path;
      }
    }

    // Check for Drive thumbnail ID
    if (row.drive_thumbnail_id && isDriveFileId(row.drive_thumbnail_id)) {
      driveThumbnailId = row.drive_thumbnail_id;
    } else if (row.thumbnail_path && isDriveFileId(row.thumbnail_path)) {
      // Auto-detect: thumbnail_path column contains a Drive file ID
      driveThumbnailId = row.thumbnail_path;
    }

    // Check for thumbnail URL (if not Drive)
    if (!driveThumbnailId) {
      if (row.thumbnail_url && isValidUrl(row.thumbnail_url)) {
        thumbnailUrl = row.thumbnail_url;
      } else if (row.thumbnail_path && isValidUrl(row.thumbnail_path)) {
        // Auto-detect: thumbnail_path column contains a URL
        thumbnailUrl = row.thumbnail_path;
      }
    }

    // Parse auth headers if provided
    let authHeaders: Record<string, string> | undefined;
    if (row.url_auth_headers) {
      try {
        authHeaders = JSON.parse(row.url_auth_headers);
      } catch (e) {
        console.warn(`Failed to parse auth headers for row ${i}:`, e);
      }
    }

    // Parse timeout if provided
    const timeout = row.url_timeout ? parseInt(row.url_timeout, 10) : undefined;

    // If URL is provided, use it; otherwise try to find file
    let videoFile: File | null = null;
    let thumbnailFile: File | null = null;

    if (!videoUrl) {
      // Use video_name column first, fallback to extracting from path
      const csvVideoFilename = row.video_name
        ? row.video_name.toLowerCase().trim()
        : row.path
          ? extractFilename(row.path)
          : "";

      // Use thumbnail_name column first, fallback to extracting from thumbnail_path
      const csvThumbFilename = row.thumbnail_name
        ? row.thumbnail_name.toLowerCase().trim()
        : row.thumbnail_path
          ? extractFilename(row.thumbnail_path)
          : "";

      videoFile = csvVideoFilename
        ? findMatchingFile(csvVideoFilename, uploadedFilesMap)
        : null;
      thumbnailFile = csvThumbFilename
        ? findMatchingFile(csvThumbFilename, uploadedThumbnailsMap)
        : null;
    }

    tasks.push({
      index: i,
      row,
      videoFile,
      thumbnailFile,
      videoUrl,
      thumbnailUrl,
      driveFileId,
      driveThumbnailId,
      authHeaders,
      timeout,
      postUploadAction: row.post_upload_action || "none",
      completedFolderId: row.completed_folder_id,
    });
  }

  // Filter out tasks without video files, URLs, or Drive IDs
  const validTasks = tasks.filter(
    (t) =>
      t.videoFile !== null ||
      t.videoUrl !== undefined ||
      t.driveFileId !== undefined,
  );
  const invalidCount = tasks.length - validTasks.length;

  if (validTasks.length === 0) {
    return new Response(
      JSON.stringify({
        error: "No matching video files, URLs, or Drive file IDs found",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create batches
  const batches: VideoUploadTask[][] = [];
  for (let i = 0; i < validTasks.length; i += batchSize) {
    batches.push(validTasks.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;

  // Return streaming response with progress updates
  const stream = createProgressStream(async (send) => {
    send({
      type: "start",
      total: validTasks.length,
      totalBatches,
      batchSize,
      invalidCount,
    });

    let totalCompleted = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchProgress = await processBatch(
        youtube,
        batch,
        i + 1,
        totalBatches,
        send,
        oAuthClient,
      );

      totalCompleted += batchProgress.completed;
      totalFailed += batchProgress.failed;

      send({
        type: "overall_progress",
        totalCompleted,
        totalFailed,
        total: validTasks.length,
        progress: Math.round(
          ((totalCompleted + totalFailed) / validTasks.length) * 100,
        ),
      });
    }

    send({
      type: "final",
      totalCompleted,
      totalFailed,
      total: validTasks.length,
      invalidCount,
    });
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// GET endpoint - Returns combined queue (regular + bulk)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get both regular queue and bulk queue
    const regularQueue = getQueue();
    const bulkQueue = getBulkQueue();

    // Global worker busy: any job (any user) is in "processing" => worker is running
    const workerBusy = bulkQueue.some((j) => j.status === "processing");
    const workerHeartbeat = readHeartbeat();

    // Filter jobs by session/user
    const userRegularJobs = regularQueue.filter(
      (job: QueueItem) =>
        job.sessionId === sessionId || job.userId === session.userId,
    );

    const userBulkJobs = bulkQueue.filter(
      (job: BulkUploadItem) =>
        job.sessionId === sessionId || job.userId === session.userId,
    );

    // Compute position ahead for each bulk job (how many jobs before it in queue)
    const positionAheadByJobId = new Map<string, number>();
    let aheadCount = 0;
    for (const j of bulkQueue) {
      if (j.status === "pending" || j.status === "processing") {
        positionAheadByJobId.set(j.id, aheadCount);
        aheadCount++;
      }
    }

    // Combine and normalize both queues
    const combinedQueue = [
      ...userRegularJobs.map((job: QueueItem) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        totalVideos: job.totalVideos || job.progress?.length || 0,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: undefined, // Regular queue items don't have error field
        videosPerDay: job.videosPerDay,
        startDate: job.startDate,
        notes: job.notes,
        positionAhead: 0, // Regular queue not used by worker
      })),
      ...userBulkJobs.map((job: BulkUploadItem) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        totalVideos: job.items.length,
        items: job.items.map((item, idx) => ({
          title:
            item.title && item.title.trim()
              ? item.title.trim()
              : `Video ${idx + 1}`,
        })), // Include titles for next batch display (with fallback)
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
        videosPerDay: job.videosPerDay,
        startDate: job.startDate,
        positionAhead: positionAheadByJobId.get(job.id) ?? 0,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return new Response(
      JSON.stringify({
        queue: combinedQueue,
        workerBusy,
        workerHeartbeat: workerHeartbeat
          ? {
              lastRunAt: workerHeartbeat.lastRunAt,
              jobId: workerHeartbeat.jobId,
            }
          : null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[UPLOAD-QUEUE] GET Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Error fetching queue" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
