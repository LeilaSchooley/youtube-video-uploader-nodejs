import dotenv from "dotenv";
dotenv.config();

import { getOAuthClient } from "./lib/auth";
import { getSession, getAllSessions, setSession } from "./lib/session";
import {
  getNextPendingItem,
  getQueue,
  markAsProcessing,
  markAsCompleted,
  markAsFailed,
  updateProgress,
  updateQueueItem,
  type QueueItem,
} from "./lib/queue";
import { parseDate } from "./lib/utils";
import { google } from "googleapis";
import { getFileStream, fileExists } from "./lib/storage";
import csvParser from "csv-parser";
import fs from "fs";
import path from "path";

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  path?: string;
  scheduleTime?: string;
  privacyStatus?: string;
}

async function processQueueItem(item: QueueItem): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[WORKER] [${new Date().toISOString()}] Starting to process queue item: ${
      item.id
    }`
  );

  markAsProcessing(item.id);

  try {
    // Get session - try by sessionId first, then find any session for this userId
    let session = getSession(item.sessionId);

    // If session not found but userId exists, find any active session for this user
    if (!session && item.userId) {
      const allSessions = getAllSessions();
      const sessionsArray = Array.from(allSessions.values());
      for (const s of sessionsArray) {
        if (s.userId === item.userId && s.authenticated && s.tokens) {
          session = s;
          break;
        }
      }
    }

    if (!session || !session.authenticated || !session.tokens) {
      throw new Error("Session not found or invalid");
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    // Check if refresh token is available before proceeding
    if (!session.tokens.refresh_token) {
      throw new Error(
        "No refresh token is set. Please re-authenticate by logging out and logging back in. This will ensure a refresh token is provided for background uploads."
      );
    }

    // Set up automatic token refresh
    oAuthClient.on("tokens", (tokens) => {
      if (!session.tokens) return; // Safety check

      if (tokens.refresh_token) {
        // Refresh token might be rotated, update session
        session.tokens.refresh_token = tokens.refresh_token;
      }
      // Update access token
      session.tokens.access_token = tokens.access_token;
      session.tokens.expiry_date = tokens.expiry_date;
      // Save updated tokens to session
      setSession(item.sessionId, session);
    });

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    // Parse CSV
    const csvData: CSVRow[] = [];
    const csvStream = fs.createReadStream(item.csvPath).pipe(csvParser());

    await new Promise<void>((resolve, reject) => {
      csvStream
        .on("data", (row: CSVRow) => {
          console.log(
            `[WORKER] [${new Date().toISOString()}] CSV Row ${
              csvData.length + 1
            } parsed:`,
            {
              keys: Object.keys(row),
              youtube_title: row.youtube_title
                ? `"${row.youtube_title.substring(0, 50)}..."`
                : "MISSING",
              youtube_description: row.youtube_description
                ? `"${row.youtube_description.substring(0, 50)}..."`
                : "MISSING",
              path: row.path || "MISSING",
              thumbnail_path: row.thumbnail_path || "MISSING",
              privacyStatus: row.privacyStatus || "MISSING",
              scheduleTime: row.scheduleTime || "MISSING",
              fullRow: row,
            }
          );
          csvData.push(row);
        })
        .on("end", () => {
          console.log(
            `[WORKER] [${new Date().toISOString()}] CSV parsing complete. Total rows: ${
              csvData.length
            }`
          );
          resolve();
        })
        .on("error", (error) => {
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] CSV parsing error:`,
            error
          );
          reject(error);
        });
    });

    // Calculate scheduled dates
    const scheduledDates: Date[] = [];
    if (item.videosPerDay > 0) {
      const startDate = new Date(item.startDate);
      startDate.setHours(12, 0, 0, 0); // Set publish time to noon

      for (let i = 0; i < csvData.length; i++) {
        const dayIndex = Math.floor(i / item.videosPerDay);
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(startDate.getDate() + dayIndex);
        scheduledDates.push(scheduledDate);
      }

      console.log(
        `Job ${item.id}: Scheduling ${csvData.length} videos with ${
          item.videosPerDay
        } videos/day starting ${startDate.toLocaleDateString()}`
      );
      console.log(
        `First video scheduled for: ${scheduledDates[0]?.toLocaleDateString()}`
      );
    }

    // Load existing progress or initialize
    const existingProgress = item.progress || [];
    const progress: Array<{ index: number; status: string }> = [
      ...existingProgress,
    ];

    // Initialize progress for all videos if not already done
    while (progress.length < csvData.length) {
      progress.push({ index: progress.length, status: "Pending" });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0); // Start of today (midnight)

    // Track how many videos we've processed today (for videosPerDay limit)
    let videosProcessedToday = 0;
    const todayProcessedLimit =
      item.videosPerDay > 0 ? item.videosPerDay : csvData.length;

    // Process videos based on schedule - upload videos scheduled for TODAY or earlier
    for (let i = 0; i < csvData.length; i++) {
      // If we've reached the daily limit, stop processing
      if (
        item.videosPerDay > 0 &&
        videosProcessedToday >= todayProcessedLimit
      ) {
        break;
      }
      // Skip if already processed (uploaded, failed, or invalid)
      const existingStatus = progress[i]?.status || "Pending";
      if (
        existingStatus.includes("Uploaded") ||
        existingStatus.includes("Scheduled") ||
        existingStatus.includes("scheduled") ||
        existingStatus.includes("Failed") ||
        existingStatus.includes("Missing") ||
        existingStatus.includes("Invalid")
      ) {
        continue; // Skip already processed videos
      }
      const row = csvData[i];
      const {
        youtube_title,
        youtube_description,
        thumbnail_path,
        path,
        scheduleTime,
        privacyStatus,
      } = row;

      // Progress already initialized above, just update status
      if (!progress[i]) {
        progress[i] = { index: i, status: "Pending" };
      }

      // Log row data for debugging
      console.log(
        `[WORKER] [${new Date().toISOString()}] Video ${i + 1}/${
          csvData.length
        } - Processing row:`,
        {
          index: i,
          has_youtube_title: !!youtube_title,
          youtube_title: youtube_title
            ? `"${youtube_title.substring(0, 50)}..."`
            : "NULL/EMPTY",
          has_youtube_description: !!youtube_description,
          youtube_description: youtube_description
            ? `"${youtube_description.substring(0, 50)}..."`
            : "NULL/EMPTY",
          has_path: !!path,
          path: path || "NULL/EMPTY",
          has_thumbnail_path: !!thumbnail_path,
          thumbnail_path: thumbnail_path || "NULL/EMPTY",
          privacyStatus: privacyStatus || "NULL/EMPTY (will default to public)",
          scheduleTime: scheduleTime || "NULL/EMPTY",
          allKeys: Object.keys(row),
          rowValues: Object.entries(row).map(([key, value]) => ({
            key,
            value:
              typeof value === "string"
                ? value.length > 50
                  ? value.substring(0, 50) + "..."
                  : value
                : String(value || ""),
            isEmpty:
              typeof value === "string" ? value.trim().length === 0 : !value,
          })),
        }
      );

      // Validate required fields with detailed error messages
      const missingFields: string[] = [];
      if (!youtube_title || youtube_title.trim().length === 0) {
        missingFields.push("youtube_title");
      }
      if (!youtube_description || youtube_description.trim().length === 0) {
        missingFields.push("youtube_description");
      }

      if (missingFields.length > 0) {
        const errorMsg = `Missing required fields: ${missingFields.join(", ")}`;
        console.error(
          `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
            i + 1
          }: ${errorMsg}`
        );
        console.error(
          `[WORKER] [ERROR] Available fields in CSV row:`,
          Object.keys(row)
        );
        console.error(
          `[WORKER] [ERROR] Row data:`,
          JSON.stringify(row, null, 2)
        );
        progress[i] = { index: i, status: errorMsg };
        updateProgress(item.id, progress);
        continue;
      }

      const finalPrivacyStatus = privacyStatus || "public";
      if (!["public", "private", "unlisted"].includes(finalPrivacyStatus)) {
        progress[i] = { index: i, status: "Invalid privacy status" };
        updateProgress(item.id, progress);
        continue;
      }

      // Determine publish date
      let publishDate: Date | null = null;
      let shouldProcessNow = false;

      if (item.videosPerDay > 0 && scheduledDates[i]) {
        publishDate = scheduledDates[i];
        // Check if this video is scheduled for today or earlier
        const scheduledDay = new Date(publishDate);
        scheduledDay.setHours(0, 0, 0, 0);
        // Process if scheduled for today or any day in the past
        shouldProcessNow = scheduledDay.getTime() <= today.getTime();

        console.log(
          `[WORKER] Video ${
            i + 1
          }: Scheduled for ${publishDate.toLocaleDateString()}, Today: ${today.toLocaleDateString()}, Should process: ${shouldProcessNow}`
        );

        // If videosPerDay is set, only process videos scheduled for today or earlier
        if (!shouldProcessNow) {
          // Keep as pending - will be processed on its scheduled day
          progress[i] = {
            index: i,
            status: `Pending - Scheduled for ${publishDate.toLocaleDateString()}`,
          };
          updateProgress(item.id, progress);
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Scheduled for future date, skipping until ${publishDate.toLocaleDateString()}`
          );
          continue;
        } else {
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Scheduled for today, processing immediately!`
          );
        }
      } else if (finalPrivacyStatus === "private" && scheduleTime) {
        publishDate = parseDate(scheduleTime);
        if (!publishDate) {
          progress[i] = { index: i, status: "Invalid schedule time" };
          updateProgress(item.id, progress);
          continue;
        }
        const scheduledDay = new Date(publishDate);
        scheduledDay.setHours(0, 0, 0, 0);
        shouldProcessNow = scheduledDay.getTime() <= today.getTime();

        if (!shouldProcessNow) {
          progress[i] = {
            index: i,
            status: `Pending - Scheduled for ${publishDate.toLocaleDateString()}`,
          };
          updateProgress(item.id, progress);
          continue;
        }
      } else {
        // No scheduling - process immediately
        shouldProcessNow = true;
      }

      // Only upload videos scheduled for today (or videos without scheduling)
      // Upload video
      const uploadPrivacyStatus = publishDate ? "private" : finalPrivacyStatus;

      // At this point, youtube_title and youtube_description are guaranteed to be strings (validated above)
      const requestBody: {
        snippet: { title: string; description: string };
        status: { privacyStatus: string; publishAt?: string };
      } = {
        snippet: {
          title: youtube_title as string, // Type assertion: validated above
          description: youtube_description as string, // Type assertion: validated above
        },
        status: { privacyStatus: uploadPrivacyStatus },
      };

      if (publishDate) {
        requestBody.status.publishAt = publishDate.toISOString();
      }

      try {
        // Check if video file exists with detailed logging
        if (!path) {
          const errorMsg = "Video path is missing in CSV";
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: ${errorMsg}`
          );
          progress[i] = { index: i, status: errorMsg };
          updateProgress(item.id, progress);
          continue;
        }

        const fileExistsResult = fileExists(path);
        if (!fileExistsResult) {
          const errorMsg = `Video file not found at: ${path}`;
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: ${errorMsg}`
          );
          console.error(
            `[WORKER] [ERROR] Current working directory: ${process.cwd()}`
          );
          console.error(`[WORKER] [ERROR] Platform: ${process.platform}`);
          console.error(
            `[WORKER] [ERROR] File path type: ${
              path.startsWith("/")
                ? "absolute (Unix)"
                : path.match(/^[A-Z]:/)
                ? "absolute (Windows)"
                : "relative"
            }`
          );

          // Try to provide helpful error message
          let helpfulError = errorMsg;
          if (path.includes("\\") || path.match(/^[A-Z]:/i)) {
            helpfulError +=
              " (Windows path detected - ensure files were copied to server storage)";
          }

          progress[i] = { index: i, status: helpfulError };
          updateProgress(item.id, progress);
          continue;
        }

        // Verify it's actually a file
        try {
          const stats = fs.statSync(path);
          if (!stats.isFile()) {
            const errorMsg = `Path exists but is not a file: ${path}`;
            console.error(
              `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
                i + 1
              }: ${errorMsg}`
            );
            progress[i] = { index: i, status: errorMsg };
            updateProgress(item.id, progress);
            continue;
          }
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: File verified (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
          );
        } catch (statError: any) {
          const errorMsg = `Cannot access file: ${
            statError?.message || "Unknown error"
          }`;
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: ${errorMsg}`
          );
          progress[i] = { index: i, status: errorMsg };
          updateProgress(item.id, progress);
          continue;
        }

        progress[i] = { index: i, status: "Uploading..." };
        updateProgress(item.id, progress);
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Starting upload to YouTube...`
        );

        const videoStream = getFileStream(path);
        const uploadStartTime = Date.now();
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id;
        const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(
          1
        );
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Upload completed! Video ID: ${videoId}, Duration: ${uploadDuration}s`
        );

        // Upload thumbnail if provided
        if (thumbnail_path && videoId && fileExists(thumbnail_path)) {
          progress[i] = { index: i, status: "Uploading thumbnail..." };
          updateProgress(item.id, progress);
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Uploading thumbnail...`
          );

          const thumbnailStream = getFileStream(thumbnail_path);
          await youtube.thumbnails.set({
            videoId: videoId,
            media: { body: thumbnailStream },
          });
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Thumbnail uploaded successfully`
          );
        }

        // Try to update privacy status if needed
        if (
          uploadPrivacyStatus === "private" &&
          finalPrivacyStatus !== "private" &&
          videoId
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
            progress[i] = {
              index: i,
              status: publishDate
                ? `Uploaded & scheduled as ${finalPrivacyStatus} for ${publishDate.toLocaleDateString()}`
                : `Uploaded as ${finalPrivacyStatus}`,
            };
          } catch (updateError: any) {
            progress[i] = {
              index: i,
              status: publishDate
                ? `Uploaded as private (scheduled). Change to ${finalPrivacyStatus} manually after publish.`
                : `Uploaded as private. Change to ${finalPrivacyStatus} manually.`,
            };
          }
        } else {
          progress[i] = {
            index: i,
            status: publishDate
              ? `Uploaded & scheduled for ${publishDate.toLocaleDateString()}`
              : "Uploaded",
          };
        }

        updateProgress(item.id, progress);
        videosProcessedToday++; // Increment counter after successful upload
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Progress updated. Status: ${progress[i].status}`
        );
      } catch (error: any) {
        console.error(
          `[WORKER] [ERROR] [${new Date().toISOString()}] Error uploading video ${
            i + 1
          }:`,
          {
            message: error?.message,
            code: error?.code,
            status: error?.status,
            response: error?.response?.data,
          }
        );
        progress[i] = {
          index: i,
          status: `Failed: ${error?.message || "Unknown error"}`,
        };
        updateProgress(item.id, progress);
        // Don't increment counter for failed uploads - they can be retried
      }
    }

    // Check if all videos are processed
    const allProcessed = progress.every(
      (p) =>
        p.status.includes("Uploaded") ||
        p.status.includes("Scheduled") ||
        p.status.includes("Failed") ||
        p.status.includes("Missing") ||
        p.status.includes("Invalid")
    );

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (allProcessed) {
      markAsCompleted(item.id);
      console.log(
        `[WORKER] [${new Date().toISOString()}] ✅ Job ${
          item.id
        } COMPLETED - All ${
          csvData.length
        } videos processed in ${totalDuration}s`
      );
    } else {
      // Still has pending items
      const processedCount = progress.filter(
        (p) =>
          p.status.includes("Uploaded") ||
          p.status.includes("Scheduled") ||
          p.status.includes("scheduled") ||
          p.status.includes("Failed") ||
          p.status.includes("Missing") ||
          p.status.includes("Invalid")
      ).length;

      const pendingCount = progress.filter((p) =>
        p.status.includes("Pending")
      ).length;

      // If there are videos scheduled for future days, mark as pending so worker can process them later
      if (pendingCount > 0 && item.videosPerDay > 0) {
        updateQueueItem(item.id, { status: "pending" });
        console.log(
          `[WORKER] [${new Date().toISOString()}] ⏸️ Job ${
            item.id
          }: Processed ${processedCount}/${
            csvData.length
          } videos today in ${totalDuration}s. ${pendingCount} videos scheduled for future days. Job set to PENDING.`
        );
      } else {
        // No more videos to process, mark as completed
        markAsCompleted(item.id);
        console.log(
          `[WORKER] [${new Date().toISOString()}] ✅ Job ${
            item.id
          } COMPLETED: ${processedCount}/${
            csvData.length
          } videos processed in ${totalDuration}s`
        );
      }
    }
  } catch (error: any) {
    console.error(`Error processing queue item ${item.id}:`, error);
    markAsFailed(item.id, error?.message || "Unknown error");
  }
}

async function runWorker(): Promise<void> {
  console.log(
    `[WORKER] [${new Date().toISOString()}] 🚀 Worker started. Checking for pending items every 5 seconds...`
  );

  let checkCount = 0;
  while (true) {
    try {
      checkCount++;
      const allQueue = getQueue(); // Import getQueue if needed
      const pendingItems = allQueue.filter((item) => item.status === "pending");

      // Log every check to see what's happening
      if (checkCount % 6 === 0 || pendingItems.length > 0) {
        // Log every 30 seconds or when items found
        console.log(
          `[WORKER] [${new Date().toISOString()}] 🔍 Check #${checkCount}: Found ${
            pendingItems.length
          } pending job(s)`
        );
        if (pendingItems.length > 0) {
          pendingItems.forEach((item) => {
            console.log(
              `[WORKER]   - Job ${item.id}: status=${item.status}, videos=${
                item.totalVideos || 0
              }, videosPerDay=${item.videosPerDay}`
            );
          });
        }
      }

      const item = getNextPendingItem();

      if (item) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] 📦 Found pending job: ${
            item.id
          }, processing now...`
        );
        await processQueueItem(item);
        // After processing, check again immediately for more items
        continue;
      } else {
        // No pending items, wait before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
      }
    } catch (error) {
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] Worker error:`,
        error
      );
      // On error, wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds on error
    }
  }
}

// Run worker if this file is executed directly
if (require.main === module) {
  runWorker().catch(console.error);
}

export { runWorker };
