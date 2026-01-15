import fs from "fs";
import path from "path";
import { Readable } from "stream";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadDir(sessionId: string, jobId: string): string {
  const dir = path.join(UPLOADS_DIR, sessionId, jobId);
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

export function deleteUploadDir(sessionId: string, jobId: string): void {
  const dir = path.join(UPLOADS_DIR, sessionId, jobId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function cleanupUploadDir(sessionId: string, jobId: string): void {
  deleteUploadDir(sessionId, jobId);
}

/**
 * Delete a specific file from a job directory
 * @param sessionId - Session ID
 * @param jobId - Job ID
 * @param filePath - Relative path to file (e.g., "videos/video.mp4" or "thumbnails/thumb.jpg")
 * @returns true if deleted, false if not found
 */
export function deleteFile(sessionId: string, jobId: string, filePath: string): boolean {
  const jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
  const fullPath = path.join(jobDir, filePath);
  
  // Security: Ensure the file path is within the job directory
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(jobDir)) {
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
 * @param sessionId - Session ID
 * @param jobId - Job ID
 * @returns Object with videos, thumbnails, and csv file info
 */
export function listJobFiles(sessionId: string, jobId: string): {
  videos: Array<{ name: string; path: string; size: number }>;
  thumbnails: Array<{ name: string; path: string; size: number }>;
  csv?: { name: string; path: string; size: number };
} {
  const jobDir = path.join(UPLOADS_DIR, sessionId, jobId);
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

