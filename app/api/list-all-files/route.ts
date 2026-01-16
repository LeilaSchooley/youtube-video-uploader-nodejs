import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueue } from "@/lib/queue";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface FileInfo {
  jobId: string;
  jobStatus: string;
  jobCreatedAt: string;
  fileName: string;
  filePath: string;
  relativePath: string;
  size: number;
  sizeFormatted: string;
  type: "video" | "thumbnail" | "csv" | "other";
  jobSessionId: string;
  isOrphan?: boolean; // File exists but job not in queue
}

/**
 * Recursively scan a directory and return all files
 */
function scanDirectory(dir: string, relativeTo: string = ""): Array<{ name: string; path: string; relativePath: string; size: number }> {
  const results: Array<{ name: string; path: string; relativePath: string; size: number }> = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }
  
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = relativeTo ? `${relativeTo}/${item}` : item;
      
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          results.push({
            name: item,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
          });
        } else if (stats.isDirectory()) {
          // Recursively scan subdirectories
          results.push(...scanDirectory(fullPath, relPath));
        }
      } catch (error) {
        // Skip items that can't be accessed
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  
  return results;
}

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

    // Check if a specific channel is requested
    const { searchParams } = new URL(request.url);
    const requestedChannel = searchParams.get("channel");

    // Get userId from session (or fetch if not stored)
    let userId = session.userId;
    if (!userId && !requestedChannel) {
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

    // Use requested channel if provided, otherwise use current userId
    const targetUserId = requestedChannel || userId;
    const safeTargetUserId = targetUserId ? targetUserId.replace(/[^a-zA-Z0-9._-]/g, '_') : null;

    const queue = getQueue();
    
    // Filter jobs belonging to the target channel/user
    const userJobs = queue.filter(item => {
      if (requestedChannel) {
        // When a specific channel is requested, match by userId only
        const itemSafeUserId = item.userId ? item.userId.replace(/[^a-zA-Z0-9._-]/g, '_') : null;
        return itemSafeUserId === safeTargetUserId;
      } else {
        // Default behavior: match by userId or sessionId
        const matchesUser = (item.userId && item.userId === userId) || 
                           (!item.userId && item.sessionId === sessionId);
        return matchesUser;
      }
    });

    // Create a set of known job IDs for quick lookup
    const knownJobIds = new Set(userJobs.map(job => job.id));

    const uploadsDir = path.join(process.cwd(), "uploads");
    const allFiles: FileInfo[] = [];

    // Helper to determine file type from path
    const getFileType = (relativePath: string): "video" | "thumbnail" | "csv" | "other" => {
      if (relativePath.includes("/videos/") || relativePath.startsWith("videos/")) return "video";
      if (relativePath.includes("/thumbnails/") || relativePath.startsWith("thumbnails/")) return "thumbnail";
      if (relativePath.endsWith(".csv")) return "csv";
      return "other";
    };

    // Helper to format size
    const formatSize = (bytes: number, type: "video" | "thumbnail" | "csv" | "other"): string => {
      if (type === "video" || bytes > 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
      }
      return `${(bytes / 1024).toFixed(2)} KB`;
    };

    // Use targetUserId for directory scanning
    const safeUserId = safeTargetUserId;

    // Method 1: Scan files from known jobs in queue
    for (const job of userJobs) {
      // Try multiple possible paths (userId-based and sessionId-based for backward compatibility)
      const possiblePaths = [];
      
      // Try userId-based path (new format)
      if (safeUserId) {
        possiblePaths.push(path.join(uploadsDir, safeUserId, job.id));
      }
      
      // Try job.userId-based path (if different from current user)
      if (job.userId) {
        const safeJobUserId = job.userId.replace(/[^a-zA-Z0-9._-]/g, '_');
        possiblePaths.push(path.join(uploadsDir, safeJobUserId, job.id));
      }
      
      // Try sessionId-based path (old format - backward compatibility)
      possiblePaths.push(path.join(uploadsDir, job.sessionId, job.id));
      
      // Find the first path that exists
      let jobDir: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          jobDir = p;
          break;
        }
      }
      
      if (!jobDir) {
        continue; // Skip if no directory exists
      }

      const scannedFiles = scanDirectory(jobDir);
      for (const file of scannedFiles) {
        const fileType = getFileType(file.relativePath);
        allFiles.push({
          jobId: job.id,
          jobStatus: job.status,
          jobCreatedAt: job.createdAt,
          fileName: file.name,
          filePath: file.path,
          relativePath: file.relativePath,
          size: file.size,
          sizeFormatted: formatSize(file.size, fileType),
          type: fileType,
          jobSessionId: job.sessionId,
          isOrphan: false,
        });
      }
    }

    // Method 2: Scan possible upload directories for orphan files
    const dirsToScan: string[] = [];
    
    // Scan userId-based directory (new format)
    if (safeUserId) {
      dirsToScan.push(path.join(uploadsDir, safeUserId));
    }
    
    // Only scan sessionId-based directory if no specific channel was requested (backward compatibility)
    if (!requestedChannel) {
      dirsToScan.push(path.join(uploadsDir, sessionId));
    }
    
    for (const scanDir of dirsToScan) {
      if (!fs.existsSync(scanDir)) continue;
      
      try {
        const jobDirs = fs.readdirSync(scanDir);
        for (const jobDirName of jobDirs) {
          // Skip if this job is already processed from queue
          if (knownJobIds.has(jobDirName)) {
            continue;
          }
          
          // This is an orphan job directory (not in queue)
          const jobDir = path.join(scanDir, jobDirName);
          let stats;
          try {
            stats = fs.statSync(jobDir);
          } catch {
            continue;
          }
          
          if (!stats.isDirectory()) continue;
          
          const scannedFiles = scanDirectory(jobDir);
          for (const file of scannedFiles) {
            const fileType = getFileType(file.relativePath);
            allFiles.push({
              jobId: jobDirName,
              jobStatus: "orphan", // Not in queue
              jobCreatedAt: stats.birthtime.toISOString(),
              fileName: file.name,
              filePath: file.path,
              relativePath: file.relativePath,
              size: file.size,
              sizeFormatted: formatSize(file.size, fileType),
              type: fileType,
              jobSessionId: sessionId,
              isOrphan: true,
            });
          }
          
          // Add this job to known set to avoid duplicates
          knownJobIds.add(jobDirName);
        }
      } catch (error) {
        console.error(`Error scanning directory ${scanDir}:`, error);
      }
    }

    // Calculate totals
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
    const videoCount = allFiles.filter(f => f.type === "video").length;
    const thumbnailCount = allFiles.filter(f => f.type === "thumbnail").length;
    const csvCount = allFiles.filter(f => f.type === "csv").length;
    const orphanCount = allFiles.filter(f => f.isOrphan).length;

    // Group by job for easier display
    const filesByJob = allFiles.reduce((acc, file) => {
      if (!acc[file.jobId]) {
        acc[file.jobId] = {
          jobId: file.jobId,
          jobStatus: file.jobStatus,
          jobCreatedAt: file.jobCreatedAt,
          files: [],
          totalSize: 0,
          isOrphan: file.isOrphan,
        };
      }
      acc[file.jobId].files.push(file);
      acc[file.jobId].totalSize += file.size;
      return acc;
    }, {} as Record<string, {
      jobId: string;
      jobStatus: string;
      jobCreatedAt: string;
      files: FileInfo[];
      totalSize: number;
      isOrphan?: boolean;
    }>);

    // Debug info
    const userUploadDir = safeUserId ? path.join(uploadsDir, safeUserId) : null;
    const sessionUploadDir = path.join(uploadsDir, sessionId);
    
    console.log(`[LIST-ALL-FILES] Session: ${sessionId.substring(0, 10)}..., UserId: ${userId || 'N/A'}`);
    console.log(`[LIST-ALL-FILES] Safe UserId: ${safeUserId || 'N/A'}`);
    console.log(`[LIST-ALL-FILES] Queue jobs: ${userJobs.length}, Files found: ${allFiles.length}, Orphans: ${orphanCount}`);
    console.log(`[LIST-ALL-FILES] Uploads dir: ${uploadsDir}, exists: ${fs.existsSync(uploadsDir)}`);
    if (userUploadDir) {
      console.log(`[LIST-ALL-FILES] User upload dir: ${userUploadDir}, exists: ${fs.existsSync(userUploadDir)}`);
    }
    console.log(`[LIST-ALL-FILES] Session upload dir: ${sessionUploadDir}, exists: ${fs.existsSync(sessionUploadDir)}`);

    return NextResponse.json({
      success: true,
      totalFiles: allFiles.length,
      totalSize,
      totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      videoCount,
      thumbnailCount,
      csvCount,
      orphanCount,
      files: allFiles,
      filesByJob: Object.values(filesByJob),
      jobs: userJobs.length,
      debug: {
        sessionId: sessionId.substring(0, 10) + "...",
        userId: userId || "N/A",
        safeUserId: safeUserId || "N/A",
        uploadsDir,
        uploadsDirExists: fs.existsSync(uploadsDir),
        userDirExists: userUploadDir ? fs.existsSync(userUploadDir) : false,
        sessionDirExists: fs.existsSync(sessionUploadDir),
      },
    });
  } catch (error: any) {
    console.error("List all files error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list files" },
      { status: 500 }
    );
  }
}


