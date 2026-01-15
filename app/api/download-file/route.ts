import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem, getQueue } from "@/lib/queue";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Download a file from a job directory
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
    const filePath = searchParams.get("filePath");
    const staging = searchParams.get("staging") === "true";
    const fileName = searchParams.get("fileName");
    const fileType = searchParams.get("type") as "video" | "thumbnail" | "csv" | null;

    // Handle staging file downloads
    if (staging && fileName && fileType) {
      const uploadsDir = path.join(process.cwd(), "uploads");
      const userId = session.userId;
      const safeUserId = userId ? userId.replace(/[^a-zA-Z0-9._-]/g, '_') : sessionId;
      const stagingDir = path.join(uploadsDir, safeUserId, "staging");
      const subDir = fileType === "video" ? "videos" : fileType === "thumbnail" ? "thumbnails" : "";
      
      if (!subDir) {
        return NextResponse.json(
          { error: "Invalid file type for staging" },
          { status: 400 }
        );
      }
      
      const fullPath = path.join(stagingDir, subDir, fileName);
      
      // Security: Ensure the file path is within the staging directory
      const normalizedPath = path.normalize(fullPath);
      const normalizedStagingDir = path.normalize(stagingDir);
      if (!normalizedPath.startsWith(normalizedStagingDir)) {
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 400 }
        );
      }
      
      if (!fs.existsSync(normalizedPath)) {
        return NextResponse.json(
          { error: "File not found" },
          { status: 404 }
        );
      }
      
      const fileStream = fs.createReadStream(normalizedPath);
      const stats = fs.statSync(normalizedPath);
      
      return new NextResponse(fileStream, {
        headers: {
          'Content-Type': fileType === "video" ? 'video/mp4' : 'image/jpeg',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': stats.size.toString(),
        },
      });
    }

    // Handle job file downloads
    if (!jobId || !filePath) {
      return NextResponse.json(
        { error: "jobId and filePath are required (or staging=true with fileName and type)" },
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
    
    // Also check userId-based path
    let fullPath: string | null = null;
    if (userId) {
      const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
      const userIdJobDir = path.join(uploadsDir, safeUserId, jobId);
      const userIdFilePath = path.join(userIdJobDir, filePath);
      if (fs.existsSync(userIdFilePath)) {
        fullPath = userIdFilePath;
      }
    }
    
    if (!fullPath) {
      fullPath = path.join(jobDir, filePath);
    }
    
    // Security: Ensure the file path is within the job directory
    const normalizedPath = path.normalize(fullPath);
    const normalizedJobDir = path.normalize(jobDir);
    const normalizedUserIdJobDir = userId ? path.normalize(path.join(uploadsDir, userId.replace(/[^a-zA-Z0-9._-]/g, '_'), jobId)) : null;
    
    if (!normalizedPath.startsWith(normalizedJobDir) && 
        (!normalizedUserIdJobDir || !normalizedPath.startsWith(normalizedUserIdJobDir))) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 400 }
      );
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    
    const fileStream = fs.createReadStream(normalizedPath);
    const stats = fs.statSync(normalizedPath);
    const ext = path.extname(normalizedPath).toLowerCase();
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (ext === '.mp4' || ext === '.mov' || ext === '.avi') {
      contentType = 'video/mp4';
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.csv') {
      contentType = 'text/csv';
    }
    
    return new NextResponse(fileStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${path.basename(normalizedPath)}"`,
        'Content-Length': stats.size.toString(),
      },
    });
  } catch (error: any) {
    console.error("Download file error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to download file" },
      { status: 500 }
    );
  }
}

