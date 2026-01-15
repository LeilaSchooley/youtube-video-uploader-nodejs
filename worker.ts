import dotenv from "dotenv";
dotenv.config();

import { getOAuthClient } from "./lib/auth";
import { getSession, getAllSessions } from "./lib/session";
import { 
  getNextPendingItem, 
  markAsProcessing, 
  markAsCompleted, 
  markAsFailed, 
  updateProgress,
  updateQueueItem,
  type QueueItem 
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
  console.log(`Processing queue item: ${item.id}`);
  
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
          csvData.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
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
      
      console.log(`Job ${item.id}: Scheduling ${csvData.length} videos with ${item.videosPerDay} videos/day starting ${startDate.toLocaleDateString()}`);
      console.log(`First video scheduled for: ${scheduledDates[0]?.toLocaleDateString()}`);
    }

    // Load existing progress or initialize
    const existingProgress = item.progress || [];
    const progress: Array<{ index: number; status: string }> = [...existingProgress];
    
    // Initialize progress for all videos if not already done
    while (progress.length < csvData.length) {
      progress.push({ index: progress.length, status: "Pending" });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0); // Start of today (midnight)
    
    // Track how many videos we've processed today (for videosPerDay limit)
    let videosProcessedToday = 0;
    const todayProcessedLimit = item.videosPerDay > 0 ? item.videosPerDay : csvData.length;

    // Process videos based on schedule - upload videos scheduled for TODAY or earlier
    for (let i = 0; i < csvData.length; i++) {
      // If we've reached the daily limit, stop processing
      if (item.videosPerDay > 0 && videosProcessedToday >= todayProcessedLimit) {
        break;
      }
      // Skip if already processed (uploaded, failed, or invalid)
      const existingStatus = progress[i]?.status || "Pending";
      if (existingStatus.includes("Uploaded") || 
          existingStatus.includes("Scheduled") ||
          existingStatus.includes("scheduled") ||
          existingStatus.includes("Failed") ||
          existingStatus.includes("Missing") ||
          existingStatus.includes("Invalid")) {
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

      // Validate required fields
      if (!youtube_title || !youtube_description) {
        progress[i] = { index: i, status: "Missing required fields" };
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
        
        console.log(`Video ${i + 1}: Scheduled for ${publishDate.toLocaleDateString()}, Today: ${today.toLocaleDateString()}, Should process: ${shouldProcessNow}`);
        
        // If videosPerDay is set, only process videos scheduled for today or earlier
        if (!shouldProcessNow) {
          // Keep as pending - will be processed on its scheduled day
          progress[i] = { index: i, status: `Pending - Scheduled for ${publishDate.toLocaleDateString()}` };
          updateProgress(item.id, progress);
          continue;
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
          progress[i] = { index: i, status: `Pending - Scheduled for ${publishDate.toLocaleDateString()}` };
          updateProgress(item.id, progress);
          continue;
        }
      } else {
        // No scheduling - process immediately
        shouldProcessNow = true;
      }

      // Only upload videos scheduled for today (or videos without scheduling)
      // Upload video
      const uploadPrivacyStatus = (publishDate) ? "private" : finalPrivacyStatus;

      const requestBody: {
        snippet: { title: string; description: string };
        status: { privacyStatus: string; publishAt?: string };
      } = {
        snippet: {
          title: youtube_title,
          description: youtube_description,
        },
        status: { privacyStatus: uploadPrivacyStatus },
      };

      if (publishDate) {
        requestBody.status.publishAt = publishDate.toISOString();
      }

      try {
        // Check if video file exists
        if (!path || !fileExists(path)) {
          progress[i] = { index: i, status: "Video file not found" };
          updateProgress(item.id, progress);
          continue;
        }

        progress[i] = { index: i, status: "Uploading..." };
        updateProgress(item.id, progress);

        const videoStream = getFileStream(path);
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id;

        // Upload thumbnail if provided
        if (thumbnail_path && videoId && fileExists(thumbnail_path)) {
          progress[i] = { index: i, status: "Uploading thumbnail..." };
          updateProgress(item.id, progress);
          
          const thumbnailStream = getFileStream(thumbnail_path);
          await youtube.thumbnails.set({
            videoId: videoId,
            media: { body: thumbnailStream },
          });
        }

        // Try to update privacy status if needed
        if (uploadPrivacyStatus === "private" && finalPrivacyStatus !== "private" && videoId) {
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
                : `Uploaded as ${finalPrivacyStatus}` 
            };
          } catch (updateError: any) {
            progress[i] = { 
              index: i, 
              status: publishDate 
                ? `Uploaded as private (scheduled). Change to ${finalPrivacyStatus} manually after publish.`
                : `Uploaded as private. Change to ${finalPrivacyStatus} manually.`
            };
          }
        } else {
          progress[i] = { 
            index: i, 
            status: publishDate 
              ? `Uploaded & scheduled for ${publishDate.toLocaleDateString()}` 
              : "Uploaded" 
          };
        }

        updateProgress(item.id, progress);
        videosProcessedToday++; // Increment counter after successful upload
      } catch (error: any) {
        console.error(`Error uploading video ${i + 1}:`, error?.message);
        progress[i] = { index: i, status: `Failed: ${error?.message || "Unknown error"}` };
        updateProgress(item.id, progress);
        // Don't increment counter for failed uploads - they can be retried
      }
    }

    // Check if all videos are processed
    const allProcessed = progress.every(p => 
      p.status.includes("Uploaded") || 
      p.status.includes("Scheduled") || 
      p.status.includes("Failed") ||
      p.status.includes("Missing") ||
      p.status.includes("Invalid")
    );

    if (allProcessed) {
      markAsCompleted(item.id);
      console.log(`Queue item ${item.id} completed - all ${csvData.length} videos processed`);
    } else {
      // Still has pending items
      const processedCount = progress.filter(p => 
        p.status.includes("Uploaded") || 
        p.status.includes("Scheduled") || 
        p.status.includes("scheduled") ||
        p.status.includes("Failed") ||
        p.status.includes("Missing") ||
        p.status.includes("Invalid")
      ).length;
      
      const pendingCount = progress.filter(p => 
        p.status.includes("Pending")
      ).length;
      
      // If there are videos scheduled for future days, mark as pending so worker can process them later
      if (pendingCount > 0 && item.videosPerDay > 0) {
        updateQueueItem(item.id, { status: "pending" });
        console.log(`Queue item ${item.id}: Processed ${processedCount}/${csvData.length} videos today. ${pendingCount} videos scheduled for future days.`);
      } else {
        // No more videos to process, mark as completed
        markAsCompleted(item.id);
        console.log(`Queue item ${item.id} completed: ${processedCount}/${csvData.length} videos processed`);
      }
    }
  } catch (error: any) {
    console.error(`Error processing queue item ${item.id}:`, error);
    markAsFailed(item.id, error?.message || "Unknown error");
  }
}

async function runWorker(): Promise<void> {
  console.log("Worker started. Checking for pending items...");
  
  while (true) {
    try {
      const item = getNextPendingItem();
      
      if (item) {
        await processQueueItem(item);
      } else {
        // No pending items, wait before checking again
        await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
      }
    } catch (error) {
      console.error("Worker error:", error);
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
}

// Run worker if this file is executed directly
if (require.main === module) {
  runWorker().catch(console.error);
}

export { runWorker };

