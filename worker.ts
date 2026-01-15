import dotenv from "dotenv";
dotenv.config();

import { getOAuthClient } from "./lib/auth";
import {
  getSession,
  getAllSessions,
  setSession,
  loadSessions,
} from "./lib/session";
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

/**
 * Check if a video with the given title already exists on the user's YouTube channel
 *
 * NOTE: This function is DEPRECATED in the worker. The worker now only checks if files
 * exist on the server filesystem, not on YouTube. This avoids permission errors and
 * separates concerns (server file checks vs YouTube API checks).
 *
 * This function may still be used in other parts of the codebase (e.g., upload-csv route).
 *
 * @param youtube - YouTube API client
 * @param title - Video title to search for
 * @returns Promise<boolean> - true if video exists, false otherwise
 */
async function videoAlreadyExists(
  youtube: ReturnType<typeof google.youtube>,
  title: string
): Promise<boolean> {
  try {
    // First, get the user's channel ID
    const channelResponse = await youtube.channels.list({
      part: ["id"],
      mine: true,
    });

    if (
      !channelResponse.data.items ||
      channelResponse.data.items.length === 0
    ) {
      console.log(
        `[WORKER] [${new Date().toISOString()}] Could not get channel ID, skipping duplicate check`
      );
      return false;
    }

    const channelId = channelResponse.data.items[0].id;
    if (!channelId) {
      return false;
    }

    // Search for videos with the exact title on the user's channel
    const searchResponse = await youtube.search.list({
      part: ["snippet"],
      q: title,
      channelId: channelId,
      type: ["video"],
      maxResults: 10,
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return false;
    }

    // Check if any video has an exact title match (case-insensitive)
    const exactMatch = searchResponse.data.items.some(
      (item: any) =>
        item.snippet?.title?.toLowerCase().trim() === title.toLowerCase().trim()
    );

    if (exactMatch) {
      console.log(
        `[WORKER] [${new Date().toISOString()}] Video with title "${title.substring(
          0,
          50
        )}..." already exists on channel`
      );
    }

    return exactMatch;
  } catch (error: any) {
    // If there's an error checking, log it but don't block the upload
    const errorMessage = error?.message || "Unknown error";
    const errorCode = error?.code;

    if (
      errorCode === 403 ||
      errorMessage.includes("Insufficient Permission") ||
      errorMessage.includes("insufficient")
    ) {
      console.warn(
        `[WORKER] [WARNING] [${new Date().toISOString()}] Insufficient permissions to check for existing videos. ` +
          `Please re-authenticate to grant YouTube read access. Error: ${errorMessage}`
      );
      console.warn(
        `[WORKER] [WARNING] The duplicate check will be skipped. Videos will be uploaded even if they already exist.`
      );
    } else {
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] Error checking for existing video:`,
        errorMessage
      );
    }
    return false; // Assume video doesn't exist if check fails
  }
}

async function processQueueItem(item: QueueItem): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[WORKER] [${new Date().toISOString()}] ========================================`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}] 🎬 STARTING PROCESSING: Job ${
      item.id
    }`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - Total Videos: ${
      item.totalVideos || 0
    }`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - Videos Per Day: ${
      item.videosPerDay
    }`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - Session ID: ${
      item.sessionId?.substring(0, 20) || "N/A"
    }...`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - User ID: ${
      item.userId || "N/A"
    }`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - CSV Path: ${item.csvPath}`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}]   - Upload Dir: ${item.uploadDir}`
  );

  markAsProcessing(item.id);
  console.log(
    `[WORKER] [${new Date().toISOString()}] ✅ Job marked as PROCESSING`
  );

  try {
    // Reload sessions from disk to ensure we have the latest data
    // This is critical because sessions might be updated by the web server
    console.log(
      `[WORKER] [${new Date().toISOString()}] 🔄 Reloading sessions from disk...`
    );
    try {
      const sessionsBefore = getAllSessions().size;
      loadSessions();
      const sessionsAfter = getAllSessions().size;
      console.log(
        `[WORKER] [${new Date().toISOString()}] ✅ Sessions reloaded: ${sessionsAfter} session(s) available`
      );
      if (sessionsAfter !== sessionsBefore) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] 📊 Session count changed: ${sessionsBefore} → ${sessionsAfter}`
        );
      }
    } catch (reloadError) {
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] Failed to reload sessions:`,
        reloadError
      );
    }

    // Get session - try by sessionId first, then find any session for this userId
    console.log(
      `[WORKER] [${new Date().toISOString()}] 🔍 Looking up session by sessionId: ${
        item.sessionId?.substring(0, 20) || "N/A"
      }...`
    );
    let session = getSession(item.sessionId);

    // If session not found but userId exists, find any active session for this user
    if (!session && item.userId) {
      console.log(
        `[WORKER] [${new Date().toISOString()}] ⚠️ Session not found by sessionId, searching by userId: ${
          item.userId
        }`
      );
      const allSessions = getAllSessions();
      const sessionsArray = Array.from(allSessions.values());
      console.log(
        `[WORKER] [${new Date().toISOString()}] 🔍 Searching ${
          sessionsArray.length
        } available session(s) for userId match...`
      );

      // Log all available sessions for debugging
      allSessions.forEach((s, sessionId) => {
        console.log(
          `[WORKER]   - Session ${sessionId.substring(0, 10)}...: userId=${
            s.userId || "N/A"
          }, authenticated=${s.authenticated}, hasTokens=${!!s.tokens}`
        );
      });

      for (const s of sessionsArray) {
        if (s.userId === item.userId && s.authenticated && s.tokens) {
          session = s;
          console.log(
            `[WORKER] [${new Date().toISOString()}] ✅ Found matching session by userId: ${
              item.userId
            }`
          );
          break;
        }
      }
    }

    if (session) {
      console.log(
        `[WORKER] [${new Date().toISOString()}] ✅ Session found: authenticated=${
          session.authenticated
        }, hasTokens=${!!session.tokens}, hasRefreshToken=${!!session.tokens
          ?.refresh_token}`
      );
    } else {
      const errorMsg = `Session not found or invalid. Job sessionId: ${
        item.sessionId?.substring(0, 10) || "N/A"
      }..., userId: ${item.userId || "N/A"}`;
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] ${errorMsg}`
      );
      const availableSessions = Array.from(getAllSessions().keys());
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] Available sessions (${
          availableSessions.length
        }):`,
        availableSessions.map((id) => id.substring(0, 10))
      );
      throw new Error(errorMsg);
    }

    if (!session.authenticated || !session.tokens) {
      const errorMsg = `Session is not authenticated or missing tokens`;
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] ${errorMsg}`
      );
      throw new Error(errorMsg);
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

    // Calculate scheduled dates/times based on upload interval
    const scheduledDates: Date[] = [];
    const uploadInterval =
      item.uploadInterval || (item.videosPerDay > 0 ? "day" : undefined);
    const videosPerInterval = item.videosPerInterval || item.videosPerDay || 0;

    if (uploadInterval && videosPerInterval > 0) {
      const startDate = new Date(item.startDate);
      startDate.setSeconds(0, 0); // Round to nearest minute

      // Calculate interval in minutes
      let intervalMinutes: number;
      switch (uploadInterval) {
        case "day":
          intervalMinutes = 1440; // 24 hours
          startDate.setHours(12, 0, 0, 0); // Set to noon for daily uploads
          break;
        case "12hours":
          intervalMinutes = 720; // 12 hours
          break;
        case "6hours":
          intervalMinutes = 360; // 6 hours
          break;
        case "hour":
          intervalMinutes = 60; // 1 hour
          break;
        case "30mins":
          intervalMinutes = 30;
          break;
        case "10mins":
          intervalMinutes = 10;
          break;
        case "custom":
          intervalMinutes = item.customIntervalMinutes || 1440; // Default to 1 day if not specified
          break;
        default:
          intervalMinutes = 1440; // Default to daily
      }

      for (let i = 0; i < csvData.length; i++) {
        const intervalIndex = Math.floor(i / videosPerInterval);
        const scheduledDate = new Date(startDate);
        scheduledDate.setMinutes(
          startDate.getMinutes() + intervalIndex * intervalMinutes
        );
        scheduledDates.push(scheduledDate);
      }

      const intervalDescription =
        uploadInterval === "day"
          ? "day"
          : uploadInterval === "hour"
          ? "hour"
          : uploadInterval === "12hours"
          ? "12 hours"
          : uploadInterval === "6hours"
          ? "6 hours"
          : uploadInterval === "30mins"
          ? "30 minutes"
          : uploadInterval === "10mins"
          ? "10 minutes"
          : uploadInterval === "custom"
          ? `${item.customIntervalMinutes || 0} minutes`
          : "day";

      console.log(
        `[WORKER] [${new Date().toISOString()}] Job ${item.id}: Scheduling ${
          csvData.length
        } videos with ${videosPerInterval} videos per ${intervalDescription} starting ${startDate.toLocaleString()}`
      );
      console.log(
        `[WORKER] [${new Date().toISOString()}] First video scheduled for: ${scheduledDates[0]?.toLocaleString()}`
      );
      if (scheduledDates.length > 1) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] Last video scheduled for: ${scheduledDates[
            scheduledDates.length - 1
          ]?.toLocaleString()}`
        );
      }
    }

    // Load existing progress or initialize
    const existingProgress = item.progress || [];
    const progress: Array<{
      index: number;
      status: string;
      videoId?: string;
      fileSize?: number;
      duration?: number;
      uploadSpeed?: number;
    }> = [...existingProgress];

    // Initialize progress for all videos if not already done
    while (progress.length < csvData.length) {
      progress.push({ index: progress.length, status: "Pending" });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0); // Start of today (midnight)

    // Track how many videos we've processed in current interval (for videosPerInterval limit)
    // Note: uploadInterval and videosPerInterval are already declared above in the scheduling section

    // Calculate current interval window
    let intervalStart: Date;
    let intervalEnd: Date;

    if (uploadInterval && videosPerInterval > 0) {
      let intervalMinutes: number;
      switch (uploadInterval) {
        case "day":
          intervalMinutes = 1440;
          intervalStart = new Date(now);
          intervalStart.setHours(0, 0, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setDate(intervalEnd.getDate() + 1);
          break;
        case "12hours":
          intervalMinutes = 720;
          const hour12 = Math.floor(now.getHours() / 12) * 12;
          intervalStart = new Date(now);
          intervalStart.setHours(hour12, 0, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setHours(intervalEnd.getHours() + 12);
          break;
        case "6hours":
          intervalMinutes = 360;
          const hour6 = Math.floor(now.getHours() / 6) * 6;
          intervalStart = new Date(now);
          intervalStart.setHours(hour6, 0, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setHours(intervalEnd.getHours() + 6);
          break;
        case "hour":
          intervalMinutes = 60;
          intervalStart = new Date(now);
          intervalStart.setMinutes(0, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setHours(intervalEnd.getHours() + 1);
          break;
        case "30mins":
          intervalMinutes = 30;
          const min30 = Math.floor(now.getMinutes() / 30) * 30;
          intervalStart = new Date(now);
          intervalStart.setMinutes(min30, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setMinutes(intervalEnd.getMinutes() + 30);
          break;
        case "10mins":
          intervalMinutes = 10;
          const min10 = Math.floor(now.getMinutes() / 10) * 10;
          intervalStart = new Date(now);
          intervalStart.setMinutes(min10, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setMinutes(intervalEnd.getMinutes() + 10);
          break;
        case "custom":
          intervalMinutes = item.customIntervalMinutes || 1440;
          const customInterval = intervalMinutes;
          const customIntervalCount = Math.floor(
            (now.getTime() - new Date(item.startDate).getTime()) /
              (customInterval * 60 * 1000)
          );
          intervalStart = new Date(item.startDate);
          intervalStart.setMinutes(
            intervalStart.getMinutes() + customIntervalCount * customInterval
          );
          intervalEnd = new Date(intervalStart);
          intervalEnd.setMinutes(intervalEnd.getMinutes() + customInterval);
          break;
        default:
          intervalStart = new Date(now);
          intervalStart.setHours(0, 0, 0, 0);
          intervalEnd = new Date(intervalStart);
          intervalEnd.setDate(intervalEnd.getDate() + 1);
      }
    } else {
      // No scheduling - use full day
      intervalStart = new Date(now);
      intervalStart.setHours(0, 0, 0, 0);
      intervalEnd = new Date(intervalStart);
      intervalEnd.setDate(intervalEnd.getDate() + 1);
    }

    // Count videos processed in current interval
    let videosProcessedInInterval = 0;
    const intervalProcessedLimit =
      videosPerInterval > 0 ? videosPerInterval : csvData.length;

    // Count already processed videos in current interval
    if (videosPerInterval > 0 && scheduledDates.length > 0) {
      for (let i = 0; i < progress.length; i++) {
        const scheduledDate = scheduledDates[i];
        if (
          scheduledDate &&
          scheduledDate >= intervalStart &&
          scheduledDate < intervalEnd
        ) {
          const status = progress[i]?.status || "";
          if (
            status.includes("Uploaded") ||
            status.includes("Scheduled") ||
            status.includes("scheduled")
          ) {
            videosProcessedInInterval++;
          }
        }
      }
    }

    // Optimize: For large jobs, only check videos scheduled for current interval or earlier
    // This avoids iterating through all 1000 videos when only 10 are needed
    const videosToCheck: number[] = [];
    if (uploadInterval && videosPerInterval > 0 && scheduledDates.length > 0) {
      // Only check videos scheduled for current interval or earlier
      for (let i = 0; i < csvData.length; i++) {
        const scheduledDate = scheduledDates[i];
        if (scheduledDate && scheduledDate.getTime() <= now.getTime()) {
          videosToCheck.push(i);
        }
      }
      const intervalDescription =
        uploadInterval === "day"
          ? "today"
          : uploadInterval === "hour"
          ? "this hour"
          : uploadInterval === "12hours"
          ? "this 12-hour period"
          : uploadInterval === "6hours"
          ? "this 6-hour period"
          : uploadInterval === "30mins"
          ? "this 30-minute period"
          : uploadInterval === "10mins"
          ? "this 10-minute period"
          : uploadInterval === "custom"
          ? `this ${item.customIntervalMinutes || 0}-minute period`
          : "this interval";
      console.log(
        `[WORKER] [${new Date().toISOString()}] Optimized: Checking ${
          videosToCheck.length
        } videos scheduled for ${intervalDescription} (out of ${
          csvData.length
        } total)`
      );
    } else {
      // No scheduling - check all videos
      for (let i = 0; i < csvData.length; i++) {
        videosToCheck.push(i);
      }
    }

    // Process videos based on schedule - upload videos scheduled for current interval or earlier
    for (const i of videosToCheck) {
      // If we've reached the interval limit, stop processing
      if (
        videosPerInterval > 0 &&
        videosProcessedInInterval >= intervalProcessedLimit
      ) {
        const intervalDescription =
          uploadInterval === "day"
            ? "Daily"
            : uploadInterval === "hour"
            ? "Hourly"
            : uploadInterval === "12hours"
            ? "12-hour"
            : uploadInterval === "6hours"
            ? "6-hour"
            : uploadInterval === "30mins"
            ? "30-minute"
            : uploadInterval === "10mins"
            ? "10-minute"
            : uploadInterval === "custom"
            ? `${item.customIntervalMinutes || 0}-minute`
            : "Interval";
        console.log(
          `[WORKER] [${new Date().toISOString()}] ${intervalDescription} limit reached (${videosProcessedInInterval}/${intervalProcessedLimit}). Stopping processing.`
        );
        break;
      }
      // Skip if already processed (uploaded, failed, or invalid)
      const existingStatus = progress[i]?.status || "Pending";
      if (
        existingStatus.includes("Uploaded") ||
        existingStatus.includes("Scheduled") ||
        existingStatus.includes("scheduled") ||
        existingStatus.includes("Already uploaded") ||
        existingStatus.includes("Failed") ||
        existingStatus.includes("Missing") ||
        existingStatus.includes("Invalid") ||
        existingStatus.includes("not found") ||
        existingStatus.includes("Cannot access")
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

      if (uploadInterval && videosPerInterval > 0 && scheduledDates[i]) {
        publishDate = scheduledDates[i];
        // Check if this video is scheduled for current interval or earlier
        shouldProcessNow = publishDate.getTime() <= now.getTime();

        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Scheduled for ${publishDate.toLocaleString()}, Now: ${now.toLocaleString()}, Should process: ${shouldProcessNow}`
        );

        // Only process videos scheduled for current interval or earlier
        if (!shouldProcessNow) {
          // Keep as pending - will be processed on its scheduled time
          progress[i] = {
            index: i,
            status: `Pending - Scheduled for ${publishDate.toLocaleString()}`,
          };
          updateProgress(item.id, progress);
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Scheduled for future time, skipping until ${publishDate.toLocaleString()}`
          );
          continue;
        } else {
          // Check if this video is in the current interval window
          if (publishDate >= intervalStart && publishDate < intervalEnd) {
            // Video is in current interval - check if we've reached the limit
            if (videosProcessedInInterval >= intervalProcessedLimit) {
              progress[i] = {
                index: i,
                status: `Pending - Interval limit reached, will process in next interval`,
              };
              updateProgress(item.id, progress);
              console.log(
                `[WORKER] [${new Date().toISOString()}] Video ${
                  i + 1
                }: In current interval but limit reached (${videosProcessedInInterval}/${intervalProcessedLimit}), deferring to next interval`
              );
              continue;
            }
          }
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Scheduled for current interval, processing immediately!`
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
      // If there's a publishDate, we need to upload as private first, then update to finalPrivacyStatus
      // If there's NO publishDate, upload directly as finalPrivacyStatus (public/unlisted)
      const uploadPrivacyStatus = publishDate ? "private" : finalPrivacyStatus;

      console.log(
        `[WORKER] [${new Date().toISOString()}] Video ${
          i + 1
        }: Upload privacy status: ${uploadPrivacyStatus}, Final privacy status: ${finalPrivacyStatus}, Has publishDate: ${!!publishDate}`
      );

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

      // Only set publishAt if there's actually a publishDate
      if (publishDate) {
        requestBody.status.publishAt = publishDate.toISOString();
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Scheduling for ${publishDate.toISOString()}`
        );
      } else {
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: No schedule - uploading directly as ${finalPrivacyStatus}`
        );
      }

      try {
        // Check if video file exists on server storage (filesystem check only)
        if (!path) {
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: Video path is missing in CSV`
          );
          progress[i] = {
            index: i,
            status: "Failed: Missing video path in CSV",
          };
          updateProgress(item.id, progress);
          continue;
        }

        progress[i] = {
          index: i,
          status: "Checking if file exists on server...",
        };
        updateProgress(item.id, progress);

        const fileExistsResult = fileExists(path);
        if (!fileExistsResult) {
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: Video file not found at: ${path}`
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

          // Use "Failed: Missing file" to ensure proper detection in UI and worker
          let errorMsg = `Failed: Missing file - ${path}`;
          if (path.includes("\\") || path.match(/^[A-Z]:/i)) {
            errorMsg = `Failed: Missing file (Windows path) - ensure files were copied to server`;
          }

          progress[i] = { index: i, status: errorMsg };
          updateProgress(item.id, progress);
          continue;
        }

        // Verify it's actually a file
        try {
          const stats = fs.statSync(path);
          if (!stats.isFile()) {
            console.error(
              `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
                i + 1
              }: Path exists but is not a file: ${path}`
            );
            progress[i] = {
              index: i,
              status: `Failed: Invalid path (not a file)`,
            };
            updateProgress(item.id, progress);
            continue;
          }
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: File exists on server storage (${(
              stats.size /
              1024 /
              1024
            ).toFixed(2)} MB) - ready to upload`
          );
        } catch (statError: any) {
          console.error(
            `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
              i + 1
            }: Cannot access file: ${statError?.message || "Unknown error"}`
          );
          progress[i] = {
            index: i,
            status: `Failed: Cannot access file - ${
              statError?.message || "Unknown error"
            }`,
          };
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

        // Get file size before upload
        const fileStats = fs.statSync(path);
        const fileSize = fileStats.size;

        const videoStream = getFileStream(path);
        const uploadStartTime = Date.now();
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id || undefined;
        const uploadEndTime = Date.now();
        const uploadDurationSeconds = (uploadEndTime - uploadStartTime) / 1000;
        const uploadSpeed = fileSize / uploadDurationSeconds; // bytes per second

        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Upload completed! Video ID: ${videoId}, Duration: ${uploadDurationSeconds.toFixed(
            1
          )}s, Speed: ${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`
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

        // Update privacy status if needed (only if we uploaded as private for scheduling)
        // If there's no publishDate, we should have uploaded directly as finalPrivacyStatus
        if (
          uploadPrivacyStatus === "private" &&
          finalPrivacyStatus !== "private" &&
          videoId &&
          publishDate // Only try to update if there's actually a schedule
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
              status: `Uploaded & scheduled as ${finalPrivacyStatus} for ${publishDate.toLocaleDateString()}`,
              videoId: videoId,
              fileSize: fileSize,
              uploadSpeed: uploadSpeed,
            };
            console.log(
              `[WORKER] [${new Date().toISOString()}] Video ${
                i + 1
              }: Privacy status updated to ${finalPrivacyStatus}`
            );
          } catch (updateError: any) {
            console.error(
              `[WORKER] [ERROR] [${new Date().toISOString()}] Video ${
                i + 1
              }: Failed to update privacy status:`,
              updateError?.message
            );
            progress[i] = {
              index: i,
              status: `Uploaded as private (scheduled). Change to ${finalPrivacyStatus} manually after publish.`,
              videoId: videoId,
              fileSize: fileSize,
              uploadSpeed: uploadSpeed,
            };
          }
        } else {
          // No privacy update needed - uploaded directly as finalPrivacyStatus
          progress[i] = {
            index: i,
            status: publishDate
              ? `Uploaded & scheduled as ${finalPrivacyStatus} for ${publishDate.toLocaleDateString()}`
              : `Uploaded as ${finalPrivacyStatus}`,
            videoId: videoId,
            fileSize: fileSize,
            uploadSpeed: uploadSpeed,
          };
          console.log(
            `[WORKER] [${new Date().toISOString()}] Video ${
              i + 1
            }: Uploaded directly as ${finalPrivacyStatus}${
              publishDate
                ? ` (scheduled for ${publishDate.toLocaleDateString()})`
                : ""
            }`
          );
        }

        updateProgress(item.id, progress);
        videosProcessedInInterval++; // Increment counter after successful upload
        console.log(
          `[WORKER] [${new Date().toISOString()}] Video ${
            i + 1
          }: Progress updated. Status: ${
            progress[i].status
          }. Videos processed in current interval: ${videosProcessedInInterval}/${intervalProcessedLimit}`
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

    // Calculate final statistics
    const successCount = progress.filter(
      (p) =>
        p.status.includes("Uploaded") ||
        p.status.includes("Scheduled") ||
        p.status.includes("scheduled") ||
        p.status.includes("Already uploaded")
    ).length;

    const failedCount = progress.filter(
      (p) =>
        p.status.includes("Failed") ||
        p.status.includes("Missing") ||
        p.status.includes("Invalid") ||
        p.status.includes("not found") ||
        p.status.includes("Cannot access")
    ).length;

    const pendingCount = progress.filter(
      (p) => p.status.includes("Pending") || p.status === "Pending"
    ).length;

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[WORKER] [${new Date().toISOString()}] 📊 Job ${item.id} final stats: ` +
        `${successCount} succeeded, ${failedCount} failed, ${pendingCount} pending ` +
        `out of ${csvData.length} total`
    );

    // Determine final job status based on results
    if (pendingCount > 0 && (item.videosPerDay > 0 || item.videosPerInterval)) {
      // There are still videos pending for future processing
      updateQueueItem(item.id, { status: "pending" });
      console.log(
        `[WORKER] [${new Date().toISOString()}] ⏸️ Job ${item.id}: ` +
          `${successCount} uploaded, ${failedCount} failed, ${pendingCount} pending. ` +
          `Job set to PENDING for future processing. Duration: ${totalDuration}s`
      );
    } else if (successCount === 0 && failedCount > 0) {
      // All videos failed - mark job as failed
      markAsFailed(item.id, `All ${failedCount} video(s) failed to upload`);
      console.log(
        `[WORKER] [${new Date().toISOString()}] ❌ Job ${item.id} FAILED - ` +
          `All ${failedCount} video(s) failed. No successful uploads. Duration: ${totalDuration}s`
      );
    } else if (successCount > 0) {
      // At least some videos succeeded - mark as completed
      markAsCompleted(item.id);
      if (failedCount > 0) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] ⚠️ Job ${
            item.id
          } COMPLETED with errors - ` +
            `${successCount} uploaded, ${failedCount} failed out of ${csvData.length}. Duration: ${totalDuration}s`
        );
      } else {
        console.log(
          `[WORKER] [${new Date().toISOString()}] ✅ Job ${
            item.id
          } COMPLETED - ` +
            `All ${successCount} video(s) uploaded successfully. Duration: ${totalDuration}s`
        );
      }
    } else {
      // No videos processed at all (edge case - empty CSV or all skipped)
      markAsCompleted(item.id);
      console.log(
        `[WORKER] [${new Date().toISOString()}] ⚠️ Job ${
          item.id
        } COMPLETED - ` +
          `No videos were processed. Duration: ${totalDuration}s`
      );
    }
  } catch (error: any) {
    console.error(
      `[WORKER] [ERROR] Error processing queue item ${item.id}:`,
      error
    );
    markAsFailed(item.id, error?.message || "Unknown error");
  }
}

async function runWorker(): Promise<void> {
  console.log(
    `[WORKER] [${new Date().toISOString()}] 🚀 Worker started. Checking for pending items every 5 seconds...`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}] Working directory: ${process.cwd()}`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}] Queue file location: ${path.join(
      process.cwd(),
      "data",
      "queue.json"
    )}`
  );
  console.log(
    `[WORKER] [${new Date().toISOString()}] Sessions file location: ${path.join(
      process.cwd(),
      "data",
      "sessions.json"
    )}`
  );

  // Initial session load
  try {
    loadSessions();
    const initialSessions = getAllSessions();
    console.log(
      `[WORKER] [${new Date().toISOString()}] ✅ Initial session load: ${
        initialSessions.size
      } session(s) loaded`
    );
    if (initialSessions.size > 0) {
      initialSessions.forEach((session, sessionId) => {
        console.log(
          `[WORKER]   - Session ${sessionId.substring(0, 10)}...: userId=${
            session.userId || "N/A"
          }, authenticated=${session.authenticated}`
        );
      });
    }
  } catch (error) {
    console.error(`[WORKER] [ERROR] Failed to load initial sessions:`, error);
  }

  let checkCount = 0;
  while (true) {
    try {
      checkCount++;
      const checkStartTime = Date.now();

      // Reload sessions from disk on every check to ensure we have latest data
      // This is critical because sessions are updated by the web server process
      try {
        const sessionsBefore = getAllSessions().size;
        loadSessions();
        const sessionsAfter = getAllSessions().size;
        if (sessionsAfter !== sessionsBefore) {
          console.log(
            `[WORKER] [${new Date().toISOString()}] 🔄 Sessions reloaded: ${sessionsBefore} → ${sessionsAfter} sessions`
          );
        }
      } catch (reloadError) {
        console.warn(
          `[WORKER] [WARN] [${new Date().toISOString()}] Could not reload sessions: ${reloadError}`
        );
      }

      const allQueue = getQueue();
      const queueStats = {
        total: allQueue.length,
        pending: allQueue.filter((item) => item.status === "pending").length,
        processing: allQueue.filter((item) => item.status === "processing")
          .length,
        completed: allQueue.filter((item) => item.status === "completed")
          .length,
        failed: allQueue.filter((item) => item.status === "failed").length,
        paused: allQueue.filter((item) => item.status === "paused").length,
        cancelled: allQueue.filter((item) => item.status === "cancelled")
          .length,
      };

      const pendingItems = allQueue.filter((item) => item.status === "pending");

      // Log detailed queue status every check or when items found
      if (checkCount % 6 === 0 || pendingItems.length > 0) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] 🔍 Check #${checkCount}: Queue Status - Total: ${
            queueStats.total
          }, Pending: ${queueStats.pending}, Processing: ${
            queueStats.processing
          }, Completed: ${queueStats.completed}, Failed: ${
            queueStats.failed
          }, Paused: ${queueStats.paused}, Cancelled: ${queueStats.cancelled}`
        );
        if (pendingItems.length > 0) {
          console.log(
            `[WORKER] [${new Date().toISOString()}] 📋 Found ${
              pendingItems.length
            } pending job(s):`
          );
          pendingItems.forEach((item) => {
            console.log(
              `[WORKER]   - Job ${item.id.substring(0, 20)}...: status=${
                item.status
              }, videos=${item.totalVideos || 0}, videosPerDay=${
                item.videosPerDay
              }, userId=${item.userId || "N/A"}, sessionId=${
                item.sessionId?.substring(0, 10) || "N/A"
              }...`
            );
          });
        } else if (checkCount % 6 === 0) {
          console.log(
            `[WORKER] [${new Date().toISOString()}] ✅ No pending jobs found`
          );
        }
      }

      const item = getNextPendingItem();

      if (item) {
        console.log(
          `[WORKER] [${new Date().toISOString()}] 📦 Processing job: ${item.id.substring(
            0,
            20
          )}...`
        );
        console.log(
          `[WORKER] [${new Date().toISOString()}]   Details: ${
            item.totalVideos || 0
          } videos, ${item.videosPerDay} per day, userId=${
            item.userId || "N/A"
          }`
        );
        await processQueueItem(item);
        console.log(
          `[WORKER] [${new Date().toISOString()}] ✅ Finished processing job: ${item.id.substring(
            0,
            20
          )}...`
        );
        // After processing, check again immediately for more items
        continue;
      } else {
        // No pending items, wait before checking again
        const waitTime = 5000;
        if (checkCount % 6 === 0) {
          console.log(
            `[WORKER] [${new Date().toISOString()}] ⏳ No pending jobs. Waiting ${
              waitTime / 1000
            }s before next check...`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, waitTime)); // Check every 5 seconds
      }
    } catch (error) {
      console.error(
        `[WORKER] [ERROR] [${new Date().toISOString()}] Worker loop error:`,
        error
      );
      if (error instanceof Error) {
        console.error(`[WORKER] [ERROR] Error message: ${error.message}`);
        console.error(`[WORKER] [ERROR] Stack trace: ${error.stack}`);
      }
      // On error, wait a bit before retrying
      const errorWaitTime = 10000;
      console.log(
        `[WORKER] [${new Date().toISOString()}] ⏳ Waiting ${
          errorWaitTime / 1000
        }s after error before retrying...`
      );
      await new Promise((resolve) => setTimeout(resolve, errorWaitTime)); // Wait 10 seconds on error
    }
  }
}

// Run worker if this file is executed directly
if (require.main === module) {
  runWorker().catch(console.error);
}

export { runWorker };
