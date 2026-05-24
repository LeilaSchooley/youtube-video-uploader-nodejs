import type { NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { getDriveOAuthClientForSession } from "@/lib/auth-drive";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { createProgressStream } from "@/lib/upload-queue-sse";
import { parseUploadQueueCsvOrXlsx } from "@/lib/upload-queue-csv-parse";
import {
  buildVideoUploadTasksFromCsv,
  filterValidUploadTasks,
} from "@/lib/upload-queue-csv-build";
import { uploadQueueProcessBatch } from "@/lib/upload-queue-video";
import type { VideoUploadTask } from "@/lib/upload-queue-types";

export async function handleUploadQueuePost(request: NextRequest) {
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
        } catch {
          // Skip files that can't be accessed
        }
      }
    } catch {
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
            } catch {
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
            } catch {
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

  const parsed = await parseUploadQueueCsvOrXlsx(csvFile, dropboxSheetName);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const csvData = parsed.rows;

  const oAuthClient = getOAuthClient();
  oAuthClient.setCredentials(session.tokens);
  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });

  const tasks = buildVideoUploadTasksFromCsv(
    csvData,
    uploadedFiles,
    uploadedThumbnails,
  );
  const { validTasks, invalidCount } = filterValidUploadTasks(tasks);

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

  const needsDrive = validTasks.some(
    (t) => t.driveFileId || t.driveThumbnailId,
  );
  const driveOAuthClient = needsDrive
    ? await getDriveOAuthClientForSession(sessionId)
    : null;
  if (needsDrive && !driveOAuthClient) {
    return new Response(
      JSON.stringify({
        error:
          "Google Drive not connected. Connect Google Drive in the dashboard header.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

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
      const batchProgress = await uploadQueueProcessBatch(
        youtube,
        batch,
        i + 1,
        totalBatches,
        send,
        oAuthClient,
        driveOAuthClient,
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
