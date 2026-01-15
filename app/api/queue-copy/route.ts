import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem, addToQueue } from "@/lib/queue";
import { getUploadDir } from "@/lib/storage";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

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
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const originalJob = getQueueItem(jobId);
    if (!originalJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const userId = session?.userId;
    const isAuthorized = (userId && originalJob.userId === userId) || 
                        (!originalJob.userId && originalJob.sessionId === sessionId);
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 403 }
      );
    }

    // Copy CSV file to new job directory
    // Use userId from original job or current session for consistency
    const targetUserId = userId || originalJob.userId;
    const newJobId = addToQueue({
      sessionId,
      userId: targetUserId,
      csvPath: "", // Will be set below
      uploadDir: "", // Will be set below
      videosPerDay: originalJob.videosPerDay,
      startDate: new Date().toISOString(), // New start date
      uploadInterval: originalJob.uploadInterval,
      videosPerInterval: originalJob.videosPerInterval,
      customIntervalMinutes: originalJob.customIntervalMinutes,
      totalVideos: originalJob.totalVideos,
    });

    // Use userId for persistent storage (fallback to sessionId for backward compatibility)
    const newUploadDir = getUploadDir(targetUserId, newJobId, sessionId);
    const newCsvPath = path.join(newUploadDir, "metadata.csv");

    // Copy CSV file
    if (fs.existsSync(originalJob.csvPath)) {
      fs.copyFileSync(originalJob.csvPath, newCsvPath);
    }

    // Copy video and thumbnail files
    const originalVideosDir = path.join(originalJob.uploadDir, "videos");
    const originalThumbnailsDir = path.join(originalJob.uploadDir, "thumbnails");
    const newVideosDir = path.join(newUploadDir, "videos");
    const newThumbnailsDir = path.join(newUploadDir, "thumbnails");

    if (fs.existsSync(originalVideosDir)) {
      fs.mkdirSync(newVideosDir, { recursive: true });
      const videoFiles = fs.readdirSync(originalVideosDir);
      for (const file of videoFiles) {
        fs.copyFileSync(
          path.join(originalVideosDir, file),
          path.join(newVideosDir, file)
        );
      }
    }

    if (fs.existsSync(originalThumbnailsDir)) {
      fs.mkdirSync(newThumbnailsDir, { recursive: true });
      const thumbnailFiles = fs.readdirSync(originalThumbnailsDir);
      for (const file of thumbnailFiles) {
        fs.copyFileSync(
          path.join(originalThumbnailsDir, file),
          path.join(newThumbnailsDir, file)
        );
      }
    }

    // Update the new job with correct paths
    const { updateQueueItem } = await import("@/lib/queue");
    updateQueueItem(newJobId, {
      csvPath: newCsvPath,
      uploadDir: newUploadDir,
    });

    return NextResponse.json({ 
      success: true, 
      message: "Job copied successfully",
      jobId: newJobId
    });
  } catch (error: any) {
    console.error("Queue copy error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to copy job" },
      { status: 500 }
    );
  }
}


