import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueue } from "@/lib/queue";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * List all uploaded files across all jobs for the current user
 */
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
    
    // Filter jobs belonging to this user
    const userJobs = queue.filter(item => {
      const matchesUser = (item.userId && item.userId === userId) || 
                         (!item.userId && item.sessionId === sessionId);
      return matchesUser;
    });

    const uploadsDir = path.join(process.cwd(), "uploads");
    const allFiles: Array<{
      jobId: string;
      jobStatus: string;
      jobCreatedAt: string;
      fileName: string;
      filePath: string;
      relativePath: string;
      size: number;
      sizeFormatted: string;
      type: "video" | "thumbnail" | "csv";
      jobSessionId: string;
    }> = [];

    // Iterate through all user jobs
    for (const job of userJobs) {
      const jobDir = path.join(uploadsDir, job.sessionId, job.id);
      
      if (!fs.existsSync(jobDir)) {
        continue; // Skip if directory doesn't exist
      }

      const videosDir = path.join(jobDir, "videos");
      const thumbnailsDir = path.join(jobDir, "thumbnails");
      const csvPath = path.join(jobDir, "metadata.csv");

      // List video files
      if (fs.existsSync(videosDir)) {
        const videoFiles = fs.readdirSync(videosDir);
        for (const file of videoFiles) {
          const filePath = path.join(videosDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              allFiles.push({
                jobId: job.id,
                jobStatus: job.status,
                jobCreatedAt: job.createdAt,
                fileName: file,
                filePath: filePath,
                relativePath: `videos/${file}`,
                size: stats.size,
                sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
                type: "video",
                jobSessionId: job.sessionId,
              });
            }
          } catch (error) {
            // Skip files that can't be accessed
          }
        }
      }

      // List thumbnail files
      if (fs.existsSync(thumbnailsDir)) {
        const thumbnailFiles = fs.readdirSync(thumbnailsDir);
        for (const file of thumbnailFiles) {
          const filePath = path.join(thumbnailsDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              allFiles.push({
                jobId: job.id,
                jobStatus: job.status,
                jobCreatedAt: job.createdAt,
                fileName: file,
                filePath: filePath,
                relativePath: `thumbnails/${file}`,
                size: stats.size,
                sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
                type: "thumbnail",
                jobSessionId: job.sessionId,
              });
            }
          } catch (error) {
            // Skip files that can't be accessed
          }
        }
      }

      // List CSV file if exists
      if (fs.existsSync(csvPath)) {
        try {
          const stats = fs.statSync(csvPath);
          allFiles.push({
            jobId: job.id,
            jobStatus: job.status,
            jobCreatedAt: job.createdAt,
            fileName: "metadata.csv",
            filePath: csvPath,
            relativePath: "metadata.csv",
            size: stats.size,
            sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
            type: "csv",
            jobSessionId: job.sessionId,
          });
        } catch (error) {
          // Skip if can't access
        }
      }
    }

    // Calculate totals
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
    const videoCount = allFiles.filter(f => f.type === "video").length;
    const thumbnailCount = allFiles.filter(f => f.type === "thumbnail").length;
    const csvCount = allFiles.filter(f => f.type === "csv").length;

    // Group by job for easier display
    const filesByJob = allFiles.reduce((acc, file) => {
      if (!acc[file.jobId]) {
        acc[file.jobId] = {
          jobId: file.jobId,
          jobStatus: file.jobStatus,
          jobCreatedAt: file.jobCreatedAt,
          files: [],
          totalSize: 0,
        };
      }
      acc[file.jobId].files.push(file);
      acc[file.jobId].totalSize += file.size;
      return acc;
    }, {} as Record<string, {
      jobId: string;
      jobStatus: string;
      jobCreatedAt: string;
      files: typeof allFiles;
      totalSize: number;
    }>);

    return NextResponse.json({
      success: true,
      totalFiles: allFiles.length,
      totalSize,
      totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      videoCount,
      thumbnailCount,
      csvCount,
      files: allFiles,
      filesByJob: Object.values(filesByJob),
      jobs: userJobs.length,
    });
  } catch (error: any) {
    console.error("List all files error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list files" },
      { status: 500 }
    );
  }
}

