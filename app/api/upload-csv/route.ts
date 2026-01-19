import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { parseDate } from "@/lib/utils";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import fs from "fs";
import { fetchFileAsStream, isValidUrl } from "@/lib/url-stream";

// csv-parser is a CommonJS module
const csvParser = require("csv-parser");

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  path?: string;
  video_url?: string;
  thumbnail_url?: string;
  url_auth_headers?: string;  // JSON string of auth headers
  url_timeout?: string;  // Timeout in milliseconds
  scheduleTime?: string;
  privacyStatus?: string;
}

interface ProgressItem {
  index: number;
  status: string;
}

/**
 * Check if a video with the given title already exists on the user's YouTube channel
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

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log("Could not get channel ID, skipping duplicate check");
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
      console.log(`Video with title "${title.substring(0, 50)}..." already exists on channel`);
    }

    return exactMatch;
  } catch (error: any) {
    // If there's an error checking, log it but don't block the upload
    console.error("Error checking for existing video:", error?.message);
    return false; // Assume video doesn't exist if check fails
  }
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File | null;
    const enableScheduling = formData.get("enableScheduling") === "true";
    const videosPerDayStr = formData.get("videosPerDay") as string | null;
    const scheduleStartDate = formData.get("scheduleStartDate") as string | null;
    const videosPerDay = enableScheduling && videosPerDayStr ? parseInt(videosPerDayStr) : null;

    if (!csvFile) {
      return NextResponse.json(
        { status: "error", message: "No CSV file uploaded" },
        { status: 400 }
      );
    }

    if (enableScheduling && (!videosPerDay || !scheduleStartDate)) {
      return NextResponse.json(
        { status: "error", message: "Videos per day and start date are required when scheduling is enabled" },
        { status: 400 }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const csvData: CSVRow[] = [];
    const progress: ProgressItem[] = [];
    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    // Parse CSV
    const bytes = await csvFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const csvStream = Readable.from(buffer);

    await new Promise<void>((resolve, reject) => {
      csvStream
        .pipe(csvParser())
        .on("data", (row: CSVRow) => {
          csvData.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Calculate scheduled dates if scheduling is enabled
    const scheduledDates: Date[] = [];
    if (enableScheduling && videosPerDay && scheduleStartDate) {
      const startDate = new Date(scheduleStartDate);
      startDate.setHours(12, 0, 0, 0); // Set to noon for consistency
      
      for (let i = 0; i < csvData.length; i++) {
        const dayIndex = Math.floor(i / videosPerDay);
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(startDate.getDate() + dayIndex);
        scheduledDates.push(scheduledDate);
      }
    }

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const {
        youtube_title,
        youtube_description,
        thumbnail_path,
        path,
        scheduleTime,
        privacyStatus,
      } = csvData[i];

      progress.push({ index: i, status: "Uploading" });

      // Validate required fields
      if (!youtube_title || !youtube_description) {
        progress[i] = { index: i, status: "Missing required fields (youtube_title or youtube_description)" };
        continue;
      }

      // Validate privacy status, default to "public" if not specified
      const finalPrivacyStatus = privacyStatus || "public";
      if (!["public", "private", "unlisted"].includes(finalPrivacyStatus)) {
        progress[i] = { index: i, status: "Invalid privacy status" };
        continue;
      }

      // Check if video already exists on YouTube before uploading
      progress[i] = { index: i, status: "Checking for existing video..." };
      const alreadyExists = await videoAlreadyExists(youtube, youtube_title);
      
      if (alreadyExists) {
        progress[i] = {
          index: i,
          status: "Already uploaded - Skipped",
        };
        console.log(`Video ${i + 1}: Already exists on YouTube, skipping upload`);
        continue; // Skip to next video
      }

      // Determine publish date
      let publishDate: Date | null = null;
      
      if (enableScheduling && scheduledDates[i]) {
        // Use calculated schedule date
        publishDate = scheduledDates[i];
        // When scheduling is enabled, videos must be uploaded as private
        // (YouTube's publishAt only works for private videos)
      } else if (finalPrivacyStatus === "private" && scheduleTime) {
        // Use scheduleTime from CSV if provided
        publishDate = parseDate(scheduleTime);
        if (!publishDate || publishDate < new Date()) {
          progress[i] = { index: i, status: "Invalid schedule time" };
          continue;
        }
      }

      // YouTube upload
      // YouTube requires publishAt to be used with private videos
      // So we upload as private with publishAt, then update to desired privacy status
      const uploadPrivacyStatus = (enableScheduling || publishDate) ? "private" : finalPrivacyStatus;
      
      const requestBody: {
        snippet: { title: string; description: string };
        status: { privacyStatus: string; publishAt?: string };
      } = {
        snippet: { 
          title: youtube_title, 
          description: youtube_description 
        },
        status: { privacyStatus: uploadPrivacyStatus },
      };

      if (publishDate) {
        requestBody.status.publishAt = publishDate.toISOString();
        progress[i].status = `Scheduled for ${publishDate.toLocaleDateString()}`;
      }

      try {
        // Get video stream from file or URL
        // Smart detection: check if path/video_url is a URL or file path
        let videoStream: Readable;
        let videoSource: string | null = null;
        
        // Priority: video_url column > path column (auto-detect URL in path)
        if (csvData[i].video_url && isValidUrl(csvData[i].video_url!)) {
          videoSource = csvData[i].video_url!;
        } else if (path && isValidUrl(path)) {
          // Auto-detect: path column contains a URL
          videoSource = path;
        } else if (csvData[i].video_url) {
          // video_url column exists but not valid URL - try as path
          videoSource = csvData[i].video_url;
        }
        
        if (videoSource && isValidUrl(videoSource)) {
          // Handle URL-based upload
          progress[i].status = "Fetching video from URL...";
          
          // Parse auth headers if provided
          let authHeaders: Record<string, string> = {};
          if (csvData[i].url_auth_headers) {
            try {
              authHeaders = JSON.parse(csvData[i].url_auth_headers!);
            } catch (e) {
              console.warn(`Failed to parse auth headers for row ${i}:`, e);
            }
          }
          
          const timeout = csvData[i].url_timeout ? parseInt(csvData[i].url_timeout!, 10) : 10 * 60 * 1000;
          videoStream = await fetchFileAsStream(videoSource, {
            timeout,
            headers: authHeaders,
          });
        } else if (path && fs.existsSync(path)) {
          // Handle file-based upload (local file path)
          videoStream = fs.createReadStream(path);
        } else {
          progress[i] = { index: i, status: `Video file or URL not found: ${path || csvData[i].video_url || 'N/A'}` };
          continue;
        }

        progress[i].status = "Uploading video...";
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id;

        // Upload thumbnail (if provided) - support both file and URL
        // Smart detection: auto-detect URL in thumbnail_path column
        if (videoId) {
          let thumbnailStream: Readable | null = null;
          let thumbnailSource: string | null = null;
          
          // Priority: thumbnail_url column > thumbnail_path (auto-detect URL)
          if (csvData[i].thumbnail_url && isValidUrl(csvData[i].thumbnail_url!)) {
            thumbnailSource = csvData[i].thumbnail_url!;
          } else if (thumbnail_path && isValidUrl(thumbnail_path)) {
            // Auto-detect: thumbnail_path column contains a URL
            thumbnailSource = thumbnail_path;
          }
          
          if (thumbnailSource) {
            progress[i].status = "Uploading Thumbnail from URL...";
            thumbnailStream = await fetchFileAsStream(thumbnailSource, {
              timeout: 60000, // 1 minute for thumbnails
            });
          } else if (thumbnail_path && fs.existsSync(thumbnail_path)) {
            progress[i].status = "Uploading Thumbnail...";
            thumbnailStream = fs.createReadStream(thumbnail_path);
          }
          
          if (thumbnailStream) {
            await youtube.thumbnails.set({
              videoId: videoId,
              media: {
                body: thumbnailStream,
              },
            });
            progress[i].status = "Thumbnail uploaded";
          }
        }
        
        // If we uploaded as private (for scheduling) but want public/unlisted,
        // try to update the privacy status. Note: YouTube may not allow this if publishAt is set.
        // If it fails, the video will be private when published and can be changed manually.
        if (uploadPrivacyStatus === "private" && finalPrivacyStatus !== "private" && videoId) {
          try {
            await youtube.videos.update({
              part: ["status"],
              requestBody: {
                id: videoId,
                status: {
                  privacyStatus: finalPrivacyStatus,
                  publishAt: requestBody.status.publishAt, // Keep the publish date
                },
              },
            });
            progress[i].status = publishDate 
              ? `Uploaded & scheduled as ${finalPrivacyStatus} for ${publishDate.toLocaleDateString()}` 
              : `Uploaded as ${finalPrivacyStatus}`;
          } catch (updateError: any) {
            console.error(`Error updating privacy status for video ${i + 1}:`, updateError?.message);
            // YouTube doesn't allow changing privacy when publishAt is set, so it will be private when published
            progress[i].status = publishDate 
              ? `Uploaded as private (scheduled for ${publishDate.toLocaleDateString()}). Will be private when published - change manually to ${finalPrivacyStatus} after publish date.`
              : `Uploaded as private, but failed to set to ${finalPrivacyStatus}. You can change it manually.`;
          }
        } else {
          progress[i].status = publishDate 
            ? `Uploaded & scheduled for ${publishDate.toLocaleDateString()}` 
            : "Uploaded";
        }
      } catch (error: any) {
        console.error(`Error uploading video ${i + 1}:`, error?.message);
        progress[i].status = `Failed: ${error?.message || "Unknown error"}`;
      }
    }

    return NextResponse.json({ status: "success", progress });
  } catch (error: any) {
    console.error("CSV upload error:", error);
    return NextResponse.json(
      { status: "error", message: error?.message || "Failed to process CSV file" },
      { status: 500 }
    );
  }
}

