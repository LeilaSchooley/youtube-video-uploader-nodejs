import fs from "fs";
import path from "path";
import { Readable } from "stream";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Get upload directory for a job, using userId for persistence across sessions
 * Falls back to sessionId-based path for backward compatibility
 * @param userId - Google user email/ID (preferred, persistent)
 * @param jobId - Job ID
 * @param sessionId - Session ID (for backward compatibility, optional)
 * @returns Full path to upload directory
 */
export function getUploadDir(userId: string | undefined, jobId: string, sessionId?: string): string {
  // Use userId if available (persistent across sessions)
  const userIdentifier = userId || sessionId || 'anonymous';
  
  // Sanitize userId to be filesystem-safe (replace @ and other special chars)
  const safeUserId = userIdentifier.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  const dir = path.join(UPLOADS_DIR, safeUserId, jobId);
  
  // Backward compatibility: Check if old sessionId-based path exists and migrate
  if (sessionId && userId && sessionId !== userId) {
    const oldDir = path.join(UPLOADS_DIR, sessionId, jobId);
    if (fs.existsSync(oldDir) && !fs.existsSync(dir)) {
      console.log(`[STORAGE] Migrating files from ${oldDir} to ${dir}`);
      try {
        // Create new directory structure
        fs.mkdirSync(dir, { recursive: true });
        fs.mkdirSync(path.join(dir, "videos"), { recursive: true });
        fs.mkdirSync(path.join(dir, "thumbnails"), { recursive: true });
        
        // Copy files from old location to new location
        if (fs.existsSync(path.join(oldDir, "videos"))) {
          const oldVideos = fs.readdirSync(path.join(oldDir, "videos"));
          for (const file of oldVideos) {
            const oldPath = path.join(oldDir, "videos", file);
            const newPath = path.join(dir, "videos", file);
            if (fs.statSync(oldPath).isFile()) {
              fs.copyFileSync(oldPath, newPath);
            }
          }
        }
        
        if (fs.existsSync(path.join(oldDir, "thumbnails"))) {
          const oldThumbs = fs.readdirSync(path.join(oldDir, "thumbnails"));
          for (const file of oldThumbs) {
            const oldPath = path.join(oldDir, "thumbnails", file);
            const newPath = path.join(dir, "thumbnails", file);
            if (fs.statSync(oldPath).isFile()) {
              fs.copyFileSync(oldPath, newPath);
            }
          }
        }
        
        // Copy CSV if exists
        const oldCsv = path.join(oldDir, "metadata.csv");
        const newCsv = path.join(dir, "metadata.csv");
        if (fs.existsSync(oldCsv)) {
          fs.copyFileSync(oldCsv, newCsv);
        }
        
        console.log(`[STORAGE] Migration complete. Old directory can be manually removed: ${oldDir}`);
      } catch (error) {
        console.error(`[STORAGE] Error migrating files:`, error);
        // Continue with new directory if migration fails
      }
    }
  }
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "videos"), { recursive: true });
    fs.mkdirSync(path.join(dir, "thumbnails"), { recursive: true });
  }
  return dir;
}

export async function saveFile(file: File, destination: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return destination;
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function getFileStream(filePath: string): Readable {
  return fs.createReadStream(filePath);
}

/**
 * Delete upload directory for a job
 * Supports both userId and sessionId for backward compatibility
 * @param userId - Google user email/ID (preferred)
 * @param jobId - Job ID
 * @param sessionId - Session ID (for backward compatibility, optional)
 */
export function deleteUploadDir(userId: string | undefined, jobId: string, sessionId?: string): void {
  // Try userId-based path first
  if (userId) {
    const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(UPLOADS_DIR, safeUserId, jobId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    }
  }
  
  // Fallback to sessionId-based path for backward compatibility
  if (sessionId) {
    const dir = path.join(UPLOADS_DIR, sessionId, jobId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export function cleanupUploadDir(userId: string | undefined, jobId: string, sessionId?: string): void {
  deleteUploadDir(userId, jobId, sessionId);
}

/**
 * Delete a specific file from a job directory
 * @param userId - Google user email/ID (preferred)
 * @param jobId - Job ID
 * @param filePath - Relative path to file (e.g., "videos/video.mp4" or "thumbnails/thumb.jpg")
 * @param sessionId - Session ID (for backward compatibility, optional)
 * @returns true if deleted, false if not found
 */
export function deleteFile(userId: string | undefined, jobId: string, filePath: string, sessionId?: string): boolean {
  // Try userId-based path first
  let jobDir: string | null = null;
  if (userId) {
    const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
    jobDir = path.join(UPLOADS_DIR, safeUserId, jobId);
    if (!fs.existsSync(jobDir) && sessionId) {
      // Fallback to sessionId-based path
      jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
    }
  } else if (sessionId) {
    jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
  }
  
  if (!jobDir) {
    return false;
  }
  
  const fullPath = path.join(jobDir, filePath);
  
  // Security: Ensure the file path is within the job directory
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(path.normalize(jobDir))) {
    throw new Error("Invalid file path - directory traversal detected");
  }
  
  if (fs.existsSync(normalizedPath)) {
    try {
      fs.unlinkSync(normalizedPath);
      return true;
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      return false;
    }
  }
  return false;
}

/**
 * List all files in a job directory
 * @param userId - Google user email/ID (preferred)
 * @param jobId - Job ID
 * @param sessionId - Session ID (for backward compatibility, optional)
 * @returns Object with videos, thumbnails, and csv file info
 */
export function listJobFiles(userId: string | undefined, jobId: string, sessionId?: string): {
  videos: Array<{ name: string; path: string; size: number }>;
  thumbnails: Array<{ name: string; path: string; size: number }>;
  csv?: { name: string; path: string; size: number };
} {
  // Try userId-based path first
  let jobDir: string | null = null;
  if (userId) {
    const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
    jobDir = path.join(UPLOADS_DIR, safeUserId, jobId);
    if (!fs.existsSync(jobDir) && sessionId) {
      // Fallback to sessionId-based path
      jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
    }
  } else if (sessionId) {
    jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
  }
  
  if (!jobDir || !fs.existsSync(jobDir)) {
    return { videos: [], thumbnails: [] };
  }
  const videosDir = path.join(jobDir, "videos");
  const thumbnailsDir = path.join(jobDir, "thumbnails");
  
  const result: {
    videos: Array<{ name: string; path: string; size: number }>;
    thumbnails: Array<{ name: string; path: string; size: number }>;
    csv?: { name: string; path: string; size: number };
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
          result.videos.push({
            name: file,
            path: `videos/${file}`,
            size: stats.size,
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
          result.thumbnails.push({
            name: file,
            path: `thumbnails/${file}`,
            size: stats.size,
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
      result.csv = {
        name: "metadata.csv",
        path: "metadata.csv",
        size: stats.size,
      };
    } catch (error) {
      // Skip if can't access
    }
  }
  
  return result;
}

