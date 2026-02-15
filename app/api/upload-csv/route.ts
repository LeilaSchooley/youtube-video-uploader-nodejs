import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { parseDate } from "@/lib/utils";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import fs from "fs";
import { fetchFileAsStream, isValidUrl } from "@/lib/url-stream";
import { downloadDriveFile, isDriveFileId, renameDriveFile, moveDriveFile, deleteDriveFile, getDriveFileMetadata } from "@/lib/drive";
import { getUploadedTitlesSet } from "@/lib/uploaded-videos";

// csv-parser is a CommonJS module
const csvParser = require("csv-parser");

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  path?: string;
  video_url?: string;
  thumbnail_url?: string;
  drive_file_id?: string;  // Google Drive file ID for video
  drive_thumbnail_id?: string;  // Google Drive file ID for thumbnail
  url_auth_headers?: string;  // JSON string of auth headers
  url_timeout?: string;  // Timeout in milliseconds
  scheduleTime?: string;
  privacyStatus?: string;
  post_upload_action?: string;  // "rename", "delete", "move", or "none"
  completed_folder_id?: string;  // Drive folder ID for move action
}

interface ProgressItem {
  index: number;
  status: string;
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

      // Check if title already in uploaded list (no YouTube API)
      progress[i] = { index: i, status: "Checking duplicates..." };
      const uploadedSet = getUploadedTitlesSet();
      const alreadyExists = uploadedSet.has(youtube_title.toLowerCase().trim());
      if (alreadyExists) {
        progress[i] = {
          index: i,
          status: "Already uploaded - Skipped",
        };
        console.log(`Video ${i + 1}: Already in uploaded list, skipping`);
        continue;
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
        // Get video stream from file, URL, or Drive
        // Priority: Drive > URL > File path
        let videoStream: Readable;
        let driveFileId: string | null = null;
        
        // Check for Drive file ID first
        if (csvData[i].drive_file_id && isDriveFileId(csvData[i].drive_file_id!)) {
          driveFileId = csvData[i].drive_file_id!;
        } else if (path && isDriveFileId(path)) {
          // Auto-detect: path column contains a Drive file ID
          driveFileId = path;
        }
        
        if (driveFileId) {
          // Handle Drive-based upload
          progress[i].status = "Fetching video from Google Drive...";
          videoStream = await downloadDriveFile(driveFileId, oAuthClient);
        } else {
          // Check for URL
          let videoSource: string | null = null;
          if (csvData[i].video_url && isValidUrl(csvData[i].video_url!)) {
            videoSource = csvData[i].video_url!;
          } else if (path && isValidUrl(path)) {
            videoSource = path;
          } else if (csvData[i].video_url) {
            videoSource = csvData[i].video_url || null;
          }
          
          if (videoSource && isValidUrl(videoSource)) {
            // Handle URL-based upload
            progress[i].status = "Fetching video from URL...";
            
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
            progress[i] = { index: i, status: `Video file, URL, or Drive ID not found: ${path || csvData[i].video_url || csvData[i].drive_file_id || 'N/A'}` };
            continue;
          }
        }

        progress[i].status = "Uploading video...";
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id;

        // Upload thumbnail (if provided) - support file, URL, or Drive
        // Priority: Drive > URL > File path
        if (videoId) {
          let thumbnailStream: Readable | null = null;
          let driveThumbnailId: string | null = null;
          
          // Check for Drive thumbnail ID
          if (csvData[i].drive_thumbnail_id && isDriveFileId(csvData[i].drive_thumbnail_id!)) {
            driveThumbnailId = csvData[i].drive_thumbnail_id!;
          } else if (thumbnail_path && isDriveFileId(thumbnail_path)) {
            driveThumbnailId = thumbnail_path;
          }
          
          if (driveThumbnailId) {
            progress[i].status = "Uploading Thumbnail from Drive...";
            thumbnailStream = await downloadDriveFile(driveThumbnailId, oAuthClient);
          } else {
            // Check for URL
            let thumbnailSource: string | null = null;
            if (csvData[i].thumbnail_url && isValidUrl(csvData[i].thumbnail_url!)) {
              thumbnailSource = csvData[i].thumbnail_url!;
            } else if (thumbnail_path && isValidUrl(thumbnail_path)) {
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
        
        // Post-upload actions for Drive files
        if (driveFileId && videoId && csvData[i].post_upload_action && csvData[i].post_upload_action !== "none") {
          try {
            switch (csvData[i].post_upload_action!.toLowerCase()) {
              case "rename":
                // Get file extension and rename to video ID
                const fileMetadata = await getDriveFileMetadata(driveFileId, oAuthClient);
                const extension = fileMetadata.name.split('.').pop() || 'mp4';
                const newName = `${videoId}.${extension}`;
                await renameDriveFile(driveFileId, newName, oAuthClient);
                progress[i].status = `Uploaded & renamed to ${newName}`;
                break;
                
              case "delete":
                await deleteDriveFile(driveFileId, oAuthClient);
                progress[i].status = "Uploaded & deleted from Drive";
                break;
                
              case "move":
                if (csvData[i].completed_folder_id) {
                  await moveDriveFile(driveFileId, csvData[i].completed_folder_id!, oAuthClient);
                  progress[i].status = `Uploaded & moved to folder`;
                } else {
                  console.warn(`[UPLOAD-CSV] Move action requested but no completed_folder_id provided for row ${i}`);
                }
                break;
            }
          } catch (actionError: any) {
            console.error(`[UPLOAD-CSV] Post-upload action failed for row ${i}:`, actionError);
            // Don't fail - action is optional
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

