import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { addToQueue, getQueue } from "@/lib/queue";
import { getUploadDir, saveFile } from "@/lib/storage";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { Readable } from "stream";
import csvParser from "csv-parser";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  path?: string;
  scheduleTime?: string;
  privacyStatus?: string;
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

    // Get userId from session (or fetch if not stored)
    let userId = session.userId;
    if (!userId) {
      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(session.tokens);
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
      // Update session with userId
      session.userId = userId;
    }

    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File | null;
    const enableScheduling = formData.get("enableScheduling") === "true";
    const videosPerDayStr = formData.get("videosPerDay") as string | null;
    const videosPerDay = enableScheduling && videosPerDayStr ? parseInt(videosPerDayStr) : null;

    if (!csvFile) {
      return NextResponse.json(
        { error: "No CSV file uploaded" },
        { status: 400 }
      );
    }

    if (enableScheduling && !videosPerDay) {
      return NextResponse.json(
        { error: "Videos per day is required when scheduling is enabled" },
        { status: 400 }
      );
    }

    // Automatically use today's date as start date when scheduling is enabled
    const scheduleStartDate = enableScheduling ? new Date().toISOString() : null;

    // Generate job ID
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const uploadDir = getUploadDir(sessionId, jobId);
    const csvPath = path.join(uploadDir, "metadata.csv");

    // Save CSV file
    await saveFile(csvFile, csvPath);

    // Parse CSV to get video file paths
    const csvData: CSVRow[] = [];
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

    // Copy video and thumbnail files to server storage
    const updatedRows: CSVRow[] = [];
    const copyStats = {
      videosCopied: 0,
      videosSkipped: 0,
      thumbnailsCopied: 0,
      thumbnailsSkipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const updatedRow = { ...row };

      // Copy video file if it exists
      if (row.path) {
        if (fs.existsSync(row.path)) {
          try {
            const videoFilename = path.basename(row.path);
            const videoDest = path.join(uploadDir, "videos", videoFilename);
            fs.copyFileSync(row.path, videoDest);
            updatedRow.path = videoDest;
            copyStats.videosCopied++;
          } catch (error: any) {
            copyStats.errors.push(`Video ${i + 1}: ${error?.message || 'Copy failed'}`);
            copyStats.videosSkipped++;
          }
        } else {
          copyStats.errors.push(`Video ${i + 1}: File not found at ${row.path}`);
          copyStats.videosSkipped++;
        }
      }

      // Copy thumbnail file if it exists
      if (row.thumbnail_path) {
        if (fs.existsSync(row.thumbnail_path)) {
          try {
            const thumbFilename = path.basename(row.thumbnail_path);
            const thumbDest = path.join(uploadDir, "thumbnails", thumbFilename);
            fs.copyFileSync(row.thumbnail_path, thumbDest);
            updatedRow.thumbnail_path = thumbDest;
            copyStats.thumbnailsCopied++;
          } catch (error: any) {
            copyStats.errors.push(`Thumbnail ${i + 1}: ${error?.message || 'Copy failed'}`);
            copyStats.thumbnailsSkipped++;
          }
        } else {
          copyStats.thumbnailsSkipped++;
        }
      }

      updatedRows.push(updatedRow);
    }

    // Write updated CSV with server paths
    // Note: CSV fields with newlines must be quoted, and quotes must be escaped
    if (updatedRows.length > 0) {
      const headers = Object.keys(updatedRows[0]);
      const csvContent = [
        headers.join(","),
        ...updatedRows.map(row => 
          headers.map(header => {
            const value = row[header as keyof CSVRow] || "";
            // Escape quotes by doubling them (CSV standard)
            // Newlines within quoted fields are preserved
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
          }).join(",")
        )
      ].join("\n");
      fs.writeFileSync(csvPath, csvContent, 'utf8');
    }

    // Add to queue
    const queueId = addToQueue({
      sessionId,
      userId: userId,
      csvPath,
      uploadDir,
      videosPerDay: videosPerDay || 0,
      startDate: scheduleStartDate || new Date().toISOString(),
      totalVideos: csvData.length,
    });

    return NextResponse.json({
      success: true,
      jobId: queueId,
      message: "Files uploaded and queued for processing",
      totalVideos: csvData.length,
      copyStats: {
        videosCopied: copyStats.videosCopied,
        videosSkipped: copyStats.videosSkipped,
        thumbnailsCopied: copyStats.thumbnailsCopied,
        thumbnailsSkipped: copyStats.thumbnailsSkipped,
        errors: copyStats.errors,
      },
    });
  } catch (error: any) {
    console.error("Queue upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to queue upload" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get userId from session (or fetch if not stored)
    let userId = session.userId;
    if (!userId) {
      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(session.tokens || {});
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
      // Update session with userId
      session.userId = userId;
    }

    const queue = getQueue();
    // Filter by userId (persistent) or fallback to sessionId (backward compatibility)
    const userQueue = queue.filter(item => 
      (item.userId && item.userId === userId) || 
      (!item.userId && item.sessionId === sessionId)
    );

    return NextResponse.json({
      queue: userQueue,
    });
  } catch (error: any) {
    console.error("Get queue error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get queue" },
      { status: 500 }
    );
  }
}

