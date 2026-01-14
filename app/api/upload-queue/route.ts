import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { addToQueue, getQueue } from "@/lib/queue";
import { getUploadDir, saveFile } from "@/lib/storage";
import { Readable } from "stream";
import csvParser from "csv-parser";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  video?: string;
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

    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File | null;
    const enableScheduling = formData.get("enableScheduling") === "true";
    const videosPerDayStr = formData.get("videosPerDay") as string | null;
    const scheduleStartDate = formData.get("scheduleStartDate") as string | null;
    const videosPerDay = enableScheduling && videosPerDayStr ? parseInt(videosPerDayStr) : null;

    if (!csvFile) {
      return NextResponse.json(
        { error: "No CSV file uploaded" },
        { status: 400 }
      );
    }

    if (enableScheduling && (!videosPerDay || !scheduleStartDate)) {
      return NextResponse.json(
        { error: "Videos per day and start date are required when scheduling is enabled" },
        { status: 400 }
      );
    }

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
    for (const row of csvData) {
      const updatedRow = { ...row };

      // Copy video file if it exists
      if (row.video && fs.existsSync(row.video)) {
        const videoFilename = path.basename(row.video);
        const videoDest = path.join(uploadDir, "videos", videoFilename);
        fs.copyFileSync(row.video, videoDest);
        updatedRow.video = videoDest;
      }

      // Copy thumbnail file if it exists
      if (row.thumbnail_path && fs.existsSync(row.thumbnail_path)) {
        const thumbFilename = path.basename(row.thumbnail_path);
        const thumbDest = path.join(uploadDir, "thumbnails", thumbFilename);
        fs.copyFileSync(row.thumbnail_path, thumbDest);
        updatedRow.thumbnail_path = thumbDest;
      }

      updatedRows.push(updatedRow);
    }

    // Write updated CSV with server paths
    if (updatedRows.length > 0) {
      const headers = Object.keys(updatedRows[0]);
      const csvContent = [
        headers.join(","),
        ...updatedRows.map(row => 
          headers.map(header => {
            const value = row[header as keyof CSVRow] || "";
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(",")
        )
      ].join("\n");
      fs.writeFileSync(csvPath, csvContent);
    }

    // Add to queue
    const queueId = addToQueue({
      sessionId,
      csvPath,
      uploadDir,
      videosPerDay: videosPerDay || 0,
      startDate: scheduleStartDate || new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      jobId: queueId,
      message: "Files uploaded and queued for processing",
      totalVideos: csvData.length,
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

    const queue = getQueue();
    const userQueue = queue.filter(item => item.sessionId === sessionId);

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

