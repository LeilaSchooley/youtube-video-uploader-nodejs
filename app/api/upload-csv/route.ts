import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { parseDate } from "@/lib/utils";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import fs from "fs";

// csv-parser is a CommonJS module
const csvParser = require("csv-parser");

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  video?: string;
  scheduleTime?: string;
  privacyStatus?: string;
}

interface ProgressItem {
  index: number;
  status: string;
}

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
        video,
        scheduleTime,
        privacyStatus,
      } = csvData[i];

      progress.push({ index: i, status: "Uploading" });

      // Validate required fields
      if (!youtube_title || !youtube_description) {
        progress[i] = { index: i, status: "Missing required fields (youtube_title or youtube_description)" };
        continue;
      }

      // Validate privacy status
      if (!["public", "private", "unlisted"].includes(privacyStatus || "")) {
        progress[i] = { index: i, status: "Invalid privacy status" };
        continue;
      }

      // Determine publish date
      let publishDate: Date | null = null;
      
      if (enableScheduling && scheduledDates[i]) {
        // Use calculated schedule date
        publishDate = scheduledDates[i];
        // When scheduling is enabled, videos must be uploaded as private
        // (YouTube's publishAt only works for private videos)
      } else if (privacyStatus === "private" && scheduleTime) {
        // Use scheduleTime from CSV if provided
        publishDate = parseDate(scheduleTime);
        if (!publishDate || publishDate < new Date()) {
          progress[i] = { index: i, status: "Invalid schedule time" };
          continue;
        }
      }

      // YouTube upload
      // If scheduling is enabled, upload as private with publishAt
      // Otherwise, use the privacyStatus from CSV
      const finalPrivacyStatus = enableScheduling ? "private" : (privacyStatus || "private");
      
      const requestBody: {
        snippet: { title: string; description: string };
        status: { privacyStatus: string; publishAt?: string };
      } = {
        snippet: { 
          title: youtube_title, 
          description: youtube_description 
        },
        status: { privacyStatus: finalPrivacyStatus },
      };

      if (publishDate) {
        requestBody.status.publishAt = publishDate.toISOString();
        progress[i].status = `Scheduled for ${publishDate.toLocaleDateString()}`;
      }

      try {
        // Upload video
        if (!video || !fs.existsSync(video)) {
          progress[i] = { index: i, status: "Video file not found" };
          continue;
        }

        const videoStream = fs.createReadStream(video);
        const resultVideoUpload = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody,
          media: { body: videoStream },
        });
        const videoId = resultVideoUpload.data.id;

        // Upload thumbnail (if provided)
        if (thumbnail_path && videoId && fs.existsSync(thumbnail_path)) {
          progress[i].status = "Uploading Thumbnail";
          const thumbnailStream = fs.createReadStream(thumbnail_path);
          await youtube.thumbnails.set({
            videoId: videoId,
            media: {
              body: thumbnailStream,
            },
          });
        }
        
        // If scheduling was enabled and original privacyStatus was public/unlisted,
        // update the privacy status after upload
        if (enableScheduling && privacyStatus !== "private" && videoId) {
          try {
            await youtube.videos.update({
              part: ["status"],
              requestBody: {
                id: videoId,
                status: {
                  privacyStatus: privacyStatus,
                  publishAt: requestBody.status.publishAt, // Keep the publish date
                },
              },
            });
            progress[i].status = `Uploaded & scheduled as ${privacyStatus} for ${publishDate ? publishDate.toLocaleDateString() : 'N/A'}`;
          } catch (updateError: any) {
            console.error(`Error updating privacy status for video ${i + 1}:`, updateError?.message);
            progress[i].status = `Uploaded as private (scheduled), but failed to set to ${privacyStatus}. You can change it manually.`;
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

