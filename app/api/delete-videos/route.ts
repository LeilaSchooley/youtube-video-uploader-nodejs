import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem, getQueue } from "@/lib/queue";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Delete individual video files from a job
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const filePath = searchParams.get("filePath");
    const deleteAll = searchParams.get("deleteAll") === "true";

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const job = getQueueItem(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const userId = session?.userId;
    const isAuthorized = (userId && job.userId === userId) || 
                        (!job.userId && job.sessionId === sessionId);
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 403 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    const jobDir = path.join(uploadsDir, job.sessionId, jobId);
    const videosDir = path.join(jobDir, "videos");
    const thumbnailsDir = path.join(jobDir, "thumbnails");

    const deletedFiles: string[] = [];
    const errors: string[] = [];

    if (deleteAll) {
      // Delete all videos and thumbnails from the job
      try {
        // Delete all video files
        if (fs.existsSync(videosDir)) {
          const videoFiles = fs.readdirSync(videosDir);
          for (const file of videoFiles) {
            const filePath = path.join(videosDir, file);
            try {
              fs.unlinkSync(filePath);
              deletedFiles.push(`videos/${file}`);
            } catch (error: any) {
              errors.push(`Failed to delete videos/${file}: ${error?.message}`);
            }
          }
        }

        // Delete all thumbnail files
        if (fs.existsSync(thumbnailsDir)) {
          const thumbnailFiles = fs.readdirSync(thumbnailsDir);
          for (const file of thumbnailFiles) {
            const filePath = path.join(thumbnailsDir, file);
            try {
              fs.unlinkSync(filePath);
              deletedFiles.push(`thumbnails/${file}`);
            } catch (error: any) {
              errors.push(`Failed to delete thumbnails/${file}: ${error?.message}`);
            }
          }
        }

        // Optionally delete the entire job directory (including CSV)
        const deleteEntireDir = searchParams.get("deleteEntireDir") === "true";
        if (deleteEntireDir && fs.existsSync(jobDir)) {
          try {
            fs.rmSync(jobDir, { recursive: true, force: true });
            deletedFiles.push("entire job directory");
          } catch (error: any) {
            errors.push(`Failed to delete job directory: ${error?.message}`);
          }
        }

        return NextResponse.json({
          success: true,
          message: `Deleted ${deletedFiles.length} file(s) from job ${jobId}`,
          deletedFiles,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to delete files: ${error?.message}` },
          { status: 500 }
        );
      }
    } else if (filePath) {
      // Delete a specific file
      // Security: Ensure the file path is within the job directory
      const normalizedFilePath = path.normalize(filePath);
      const fullPath = path.join(jobDir, normalizedFilePath);
      
      // Prevent directory traversal attacks
      if (!fullPath.startsWith(jobDir)) {
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 400 }
        );
      }

      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          deletedFiles.push(normalizedFilePath);
          return NextResponse.json({
            success: true,
            message: `Deleted file: ${normalizedFilePath}`,
            deletedFiles,
          });
        } else {
          return NextResponse.json(
            { error: "File not found" },
            { status: 404 }
          );
        }
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to delete file: ${error?.message}` },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Either filePath or deleteAll=true is required" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Delete videos error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete videos" },
      { status: 500 }
    );
  }
}

/**
 * List all uploaded files for a job
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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const job = getQueueItem(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const userId = session?.userId;
    const isAuthorized = (userId && job.userId === userId) || 
                        (!job.userId && job.sessionId === sessionId);
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 403 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    const jobDir = path.join(uploadsDir, job.sessionId, jobId);
    const videosDir = path.join(jobDir, "videos");
    const thumbnailsDir = path.join(jobDir, "thumbnails");

    const files: {
      videos: Array<{ name: string; path: string; size: number; sizeFormatted: string }>;
      thumbnails: Array<{ name: string; path: string; size: number; sizeFormatted: string }>;
      csv?: { name: string; path: string; size: number; sizeFormatted: string };
    } = {
      videos: [],
      thumbnails: [],
    };

    // List video files
    if (fs.existsSync(videosDir)) {
      const videoFiles = fs.readdirSync(videosDir);
      for (const file of videoFiles) {
        const filePath = path.join(videosDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            files.videos.push({
              name: file,
              path: `videos/${file}`,
              size: stats.size,
              sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
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
            files.thumbnails.push({
              name: file,
              path: `thumbnails/${file}`,
              size: stats.size,
              sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
            });
          }
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
    }

    // List CSV file if exists
    const csvPath = path.join(jobDir, "metadata.csv");
    if (fs.existsSync(csvPath)) {
      try {
        const stats = fs.statSync(csvPath);
        files.csv = {
          name: "metadata.csv",
          path: "metadata.csv",
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
        };
      } catch (error) {
        // Skip if can't access
      }
    }

    // Calculate total size
    const totalSize = 
      files.videos.reduce((sum, f) => sum + f.size, 0) +
      files.thumbnails.reduce((sum, f) => sum + f.size, 0) +
      (files.csv?.size || 0);

    return NextResponse.json({
      success: true,
      jobId,
      files,
      totalSize,
      totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      totalFiles: files.videos.length + files.thumbnails.length + (files.csv ? 1 : 0),
    });
  } catch (error: any) {
    console.error("List videos error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list videos" },
      { status: 500 }
    );
  }
}



