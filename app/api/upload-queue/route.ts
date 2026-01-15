import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
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
      // Update session with userId and persist it
      session.userId = userId;
      setSession(sessionId, session);
    }

    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File | null;
    const enableScheduling = formData.get("enableScheduling") === "true";
    const videosPerDayStr = formData.get("videosPerDay") as string | null; // Backward compatibility
    const videosPerDay = enableScheduling && videosPerDayStr ? parseInt(videosPerDayStr) : null;
    
    // New interval-based scheduling
    const uploadInterval = formData.get("uploadInterval") as string | null;
    const videosPerIntervalStr = formData.get("videosPerInterval") as string | null;
    const videosPerInterval = enableScheduling && videosPerIntervalStr ? parseInt(videosPerIntervalStr) : null;
    const customIntervalMinutesStr = formData.get("customIntervalMinutes") as string | null;
    const customIntervalMinutes = uploadInterval === "custom" && customIntervalMinutesStr ? parseInt(customIntervalMinutesStr) : undefined;
    
    // Get uploaded video files (can be multiple)
    const uploadedFiles: File[] = [];
    const filesArray = formData.getAll("files") as (File | string)[];
    for (const file of filesArray) {
      if (file instanceof File && file.type.startsWith('video/')) {
        uploadedFiles.push(file);
      }
    }
    // Also check for "videoFiles" as alternative field name
    const videoFilesArray = formData.getAll("videoFiles") as (File | string)[];
    for (const file of videoFilesArray) {
      if (file instanceof File && file.type.startsWith('video/')) {
        uploadedFiles.push(file);
      }
    }

    // Get uploaded thumbnail/image files (can be multiple)
    const uploadedThumbnails: File[] = [];
    const thumbnailsArray = formData.getAll("thumbnails") as (File | string)[];
    for (const file of thumbnailsArray) {
      if (file instanceof File && (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
        uploadedThumbnails.push(file);
      }
    }
    // Also check for "thumbnailFiles" as alternative field name
    const thumbnailFilesArray = formData.getAll("thumbnailFiles") as (File | string)[];
    for (const file of thumbnailFilesArray) {
      if (file instanceof File && (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
        uploadedThumbnails.push(file);
      }
    }

    if (!csvFile) {
      return NextResponse.json(
        { error: "No CSV file uploaded" },
        { status: 400 }
      );
    }
    
    console.log(`[UPLOAD-QUEUE] Received CSV + ${uploadedFiles.length} video file(s) + ${uploadedThumbnails.length} thumbnail file(s) for upload`);

    if (enableScheduling && !videosPerInterval) {
      return NextResponse.json(
        { error: "Videos per interval is required when scheduling is enabled" },
        { status: 400 }
      );
    }
    if (enableScheduling && uploadInterval === "custom" && !customIntervalMinutes) {
      return NextResponse.json(
        { error: "Custom interval minutes is required when using custom interval" },
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
    try {
      await saveFile(csvFile, csvPath);
      console.log(`CSV file saved to: ${csvPath}`);
    } catch (saveError: any) {
      console.error("Error saving CSV file:", saveError);
      return NextResponse.json(
        { error: `Failed to save CSV file: ${saveError?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // Parse CSV to get video file paths
    const csvData: CSVRow[] = [];
    const bytes = await csvFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const csvStream = Readable.from(buffer);

    try {
      await new Promise<void>((resolve, reject) => {
        csvStream
          .pipe(csvParser())
          .on("data", (row: CSVRow) => {
            console.log(`[UPLOAD-QUEUE] CSV Row ${csvData.length + 1} parsed:`, {
              keys: Object.keys(row),
              youtube_title: row.youtube_title ? `"${row.youtube_title.substring(0, 50)}..."` : 'MISSING',
              youtube_description: row.youtube_description ? `"${row.youtube_description.substring(0, 50)}..."` : 'MISSING',
              path: row.path || 'MISSING',
              thumbnail_path: row.thumbnail_path || 'MISSING',
            });
            csvData.push(row);
          })
          .on("end", () => {
            console.log(`[UPLOAD-QUEUE] CSV parsing complete. Total rows: ${csvData.length}`);
            if (csvData.length > 0) {
              console.log(`[UPLOAD-QUEUE] First row sample:`, {
                keys: Object.keys(csvData[0]),
                values: Object.entries(csvData[0]).map(([key, value]) => ({
                  key,
                  value: typeof value === 'string' ? (value.length > 100 ? value.substring(0, 100) + '...' : value) : value
                }))
              });
            }
            resolve();
          })
          .on("error", (err) => {
            console.error("[UPLOAD-QUEUE] [ERROR] CSV parsing error:", err);
            reject(new Error(`Failed to parse CSV file: ${err.message}`));
          });
      });
    } catch (parseError: any) {
      console.error("CSV parse error:", parseError);
      return NextResponse.json(
        { error: `CSV parsing failed: ${parseError?.message || "Invalid CSV format"}` },
        { status: 400 }
      );
    }

    if (csvData.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty or contains no valid rows" },
        { status: 400 }
      );
    }

    console.log(`Parsed CSV with ${csvData.length} rows`);

    // Create a map of uploaded files by filename for quick lookup
    const uploadedFilesMap = new Map<string, File>();
    uploadedFiles.forEach(file => {
      const filename = file.name.toLowerCase();
      uploadedFilesMap.set(filename, file);
      console.log(`[UPLOAD-QUEUE] Indexed uploaded file: ${filename}`);
    });

    // Create a map of uploaded thumbnails by filename for quick lookup
    const uploadedThumbnailsMap = new Map<string, File>();
    uploadedThumbnails.forEach(file => {
      const filename = file.name.toLowerCase();
      uploadedThumbnailsMap.set(filename, file);
      console.log(`[UPLOAD-QUEUE] Indexed uploaded thumbnail: ${filename}`);
    });

    // Helper function to extract filename from path (handles Windows and Unix paths)
    const extractFilename = (filePath: string): string => {
      if (!filePath) return '';
      // Normalize path separators
      const normalized = filePath.replace(/\\/g, '/');
      // Get basename
      const basename = normalized.split('/').pop() || '';
      return basename.toLowerCase();
    };

    // Helper function to normalize paths (handle Windows paths on Linux)
    const normalizePath = (filePath: string): string => {
      if (!filePath) return filePath;
      
      // Convert Windows path separators to forward slashes
      let normalized = filePath.replace(/\\/g, '/');
      
      // If it's a Windows absolute path (C:/...), try to map it
      // For now, we'll just normalize separators and let fs.existsSync handle it
      // In production, you might need to mount Windows drives or use network paths
      
      return normalized;
    };

    // Helper function to check if file exists with detailed logging
    const checkFileExists = (filePath: string, fileType: string, index: number): { exists: boolean; normalizedPath: string; error?: string } => {
      const normalizedPath = normalizePath(filePath);
      
      console.log(`[UPLOAD-QUEUE] Checking ${fileType} ${index + 1}:`, {
        originalPath: filePath,
        normalizedPath: normalizedPath,
        platform: process.platform,
        cwd: process.cwd()
      });
      
      try {
        const exists = fs.existsSync(normalizedPath);
        if (!exists) {
          // Try original path too (in case it's already correct)
          const originalExists = fs.existsSync(filePath);
          if (originalExists) {
            console.log(`[UPLOAD-QUEUE] File exists at original path: ${filePath}`);
            return { exists: true, normalizedPath: filePath };
          }
          
          // Check if it's a Windows path on Linux
          if (filePath.match(/^[A-Z]:[\\\/]/i)) {
            return {
              exists: false,
              normalizedPath: normalizedPath,
              error: `Windows path detected on ${process.platform} server. The CSV contains Windows paths (C:\\...) but the server cannot access them. Solutions: 1) Upload files to server first using single video upload, 2) Copy files to server-accessible location, 3) Use network/shared paths accessible from server. Original path: ${filePath}`
            };
          }
          
          return {
            exists: false,
            normalizedPath: normalizedPath,
            error: `File not found: ${normalizedPath}`
          };
        }
        
        // Check if it's actually a file (not a directory)
        const stats = fs.statSync(normalizedPath);
        if (!stats.isFile()) {
          return {
            exists: false,
            normalizedPath: normalizedPath,
            error: `Path exists but is not a file: ${normalizedPath}`
          };
        }
        
        console.log(`[UPLOAD-QUEUE] ✓ ${fileType} ${index + 1} found: ${normalizedPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return { exists: true, normalizedPath: normalizedPath };
      } catch (error: any) {
        return {
          exists: false,
          normalizedPath: normalizedPath,
          error: `Error checking file: ${error?.message || 'Unknown error'}`
        };
      }
    };

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

      // Copy video file - try uploaded files first, then check server path
      if (row.path) {
        const csvFilename = extractFilename(row.path);
        const uploadedFile = uploadedFilesMap.get(csvFilename);
        
        let videoCopied = false;
        
        // First, try to use uploaded file if available
        if (uploadedFile) {
          try {
            // Sanitize filename to handle special characters
            const videoFilename = uploadedFile.name
              .replace(/[<>:"|?*]/g, '_') // Replace invalid filename chars
              .replace(/\s+/g, '_'); // Replace spaces with underscores
            
            const videoDest = path.join(uploadDir, "videos", videoFilename);
            
            console.log(`[UPLOAD-QUEUE] Saving uploaded file ${i + 1}: ${uploadedFile.name} -> ${videoDest}`);
            
            // Ensure destination directory exists
            const destDir = path.dirname(videoDest);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            
            // Save uploaded file to server
            await saveFile(uploadedFile, videoDest);
            
            // Verify save succeeded
            if (!fs.existsSync(videoDest)) {
              throw new Error('Save verification failed - destination file not found');
            }
            
            updatedRow.path = videoDest;
            copyStats.videosCopied++;
            videoCopied = true;
            console.log(`[UPLOAD-QUEUE] ✓ Video ${i + 1} saved from upload: ${uploadedFile.name}`);
          } catch (error: any) {
            const errorMsg = `Video ${i + 1}: Failed to save uploaded file - ${error?.message || 'Unknown error'}`;
            console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`, error);
            copyStats.errors.push(errorMsg);
            copyStats.videosSkipped++;
            continue;
          }
        } else {
          // No uploaded file found, try to copy from server path
          console.log(`[UPLOAD-QUEUE] No uploaded file found for "${csvFilename}", checking server path: ${row.path}`);
          
          const fileCheck = checkFileExists(row.path, 'Video', i);
          
          if (fileCheck.exists) {
            try {
              // Sanitize filename to handle special characters
              const videoFilename = path.basename(fileCheck.normalizedPath)
                .replace(/[<>:"|?*]/g, '_') // Replace invalid filename chars
                .replace(/\s+/g, '_'); // Replace spaces with underscores
              
              const videoDest = path.join(uploadDir, "videos", videoFilename);
              
              console.log(`[UPLOAD-QUEUE] Copying video ${i + 1} from server: ${fileCheck.normalizedPath} -> ${videoDest}`);
              
              // Ensure destination directory exists
              const destDir = path.dirname(videoDest);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }
              
              fs.copyFileSync(fileCheck.normalizedPath, videoDest);
              
              // Verify copy succeeded
              if (!fs.existsSync(videoDest)) {
                throw new Error('Copy verification failed - destination file not found');
              }
              
              updatedRow.path = videoDest;
              copyStats.videosCopied++;
              videoCopied = true;
              console.log(`[UPLOAD-QUEUE] ✓ Video ${i + 1} copied from server path`);
            } catch (error: any) {
              const errorMsg = `Video ${i + 1}: Copy failed - ${error?.message || 'Unknown error'}. Source: ${row.path}`;
              console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`, error);
              copyStats.errors.push(errorMsg);
              copyStats.videosSkipped++;
              continue;
            }
          } else {
            // File not found in uploads and not on server
            const errorMsg = `Video ${i + 1}: File not found. Expected filename: "${csvFilename}" from path "${row.path}". ${uploadedFiles.length > 0 ? `Uploaded ${uploadedFiles.length} file(s) but none matched.` : 'No files were uploaded.'}`;
            console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`);
            console.error(`[UPLOAD-QUEUE] Available uploaded files:`, Array.from(uploadedFilesMap.keys()));
            copyStats.errors.push(errorMsg);
            copyStats.videosSkipped++;
            continue;
          }
        }
        
        if (!videoCopied) {
          // Shouldn't reach here, but safety check
          continue;
        }
      } else {
        const errorMsg = `Video ${i + 1}: No path specified in CSV`;
        console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`);
        copyStats.errors.push(errorMsg);
        copyStats.videosSkipped++;
        continue;
      }

      // Copy thumbnail file if it exists (optional)
      if (row.thumbnail_path) {
        const csvThumbFilename = extractFilename(row.thumbnail_path);
        const uploadedThumbnail = uploadedThumbnailsMap.get(csvThumbFilename);
        
        let thumbnailCopied = false;
        
        // First, try to use uploaded thumbnail file if available
        if (uploadedThumbnail) {
          try {
            const thumbFilename = uploadedThumbnail.name
              .replace(/[<>:"|?*]/g, '_')
              .replace(/\s+/g, '_');
            
            const thumbDest = path.join(uploadDir, "thumbnails", thumbFilename);
            
            console.log(`[UPLOAD-QUEUE] Saving uploaded thumbnail ${i + 1}: ${uploadedThumbnail.name} -> ${thumbDest}`);
            
            const destDir = path.dirname(thumbDest);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            
            await saveFile(uploadedThumbnail, thumbDest);
            
            if (!fs.existsSync(thumbDest)) {
              throw new Error('Save verification failed - destination file not found');
            }
            
            updatedRow.thumbnail_path = thumbDest;
            copyStats.thumbnailsCopied++;
            thumbnailCopied = true;
            console.log(`[UPLOAD-QUEUE] ✓ Thumbnail ${i + 1} saved from upload: ${uploadedThumbnail.name}`);
          } catch (error: any) {
            const errorMsg = `Thumbnail ${i + 1}: Failed to save uploaded thumbnail - ${error?.message || 'Unknown error'}`;
            console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`, error);
            copyStats.errors.push(errorMsg);
            copyStats.thumbnailsSkipped++;
            // Thumbnail is optional, so continue even if save fails
          }
        } else {
          // No uploaded thumbnail found, try to copy from server path
          console.log(`[UPLOAD-QUEUE] No uploaded thumbnail found for "${csvThumbFilename}", checking server path: ${row.thumbnail_path}`);
          
          const fileCheck = checkFileExists(row.thumbnail_path, 'Thumbnail', i);
          
          if (fileCheck.exists) {
            try {
              const thumbFilename = path.basename(fileCheck.normalizedPath)
                .replace(/[<>:"|?*]/g, '_')
                .replace(/\s+/g, '_');
              
              const thumbDest = path.join(uploadDir, "thumbnails", thumbFilename);
              
              console.log(`[UPLOAD-QUEUE] Copying thumbnail ${i + 1} from server: ${fileCheck.normalizedPath} -> ${thumbDest}`);
              
              const destDir = path.dirname(thumbDest);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }
              
              fs.copyFileSync(fileCheck.normalizedPath, thumbDest);
              
              if (!fs.existsSync(thumbDest)) {
                throw new Error('Copy verification failed - destination file not found');
              }
              
              updatedRow.thumbnail_path = thumbDest;
              copyStats.thumbnailsCopied++;
              thumbnailCopied = true;
              console.log(`[UPLOAD-QUEUE] ✓ Thumbnail ${i + 1} copied successfully from server`);
            } catch (error: any) {
              const errorMsg = `Thumbnail ${i + 1}: Copy failed - ${error?.message || 'Unknown error'}. Source: ${row.thumbnail_path}`;
              console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`, error);
              copyStats.errors.push(errorMsg);
              copyStats.thumbnailsSkipped++;
              // Thumbnail is optional, so continue even if copy fails
            }
          } else {
            console.warn(`[UPLOAD-QUEUE] Thumbnail ${i + 1} not found: ${row.thumbnail_path} (optional, continuing)`);
            copyStats.thumbnailsSkipped++;
          }
        }
      }

      updatedRows.push(updatedRow);
    }

    // Fail the entire job if no videos were copied successfully
    if (copyStats.videosCopied === 0) {
      console.error(`[UPLOAD-QUEUE] [ERROR] No videos were copied successfully. Errors:`, copyStats.errors);
      
      // Check if all errors are Windows path related
      const allWindowsPathErrors = copyStats.errors.every(err => 
        err.includes('Windows path detected') || err.includes('C:\\') || err.includes('C:/')
      );
      
      let errorMessage = `Failed to copy video files. ${copyStats.errors.length} error(s) occurred.\n\n`;
      
      if (allWindowsPathErrors) {
        errorMessage += `⚠️ Windows Path Issue Detected:\n`;
        errorMessage += `Your CSV contains Windows file paths (C:\\...) but the server is running on ${process.platform}.\n\n`;
        errorMessage += `Solutions:\n`;
        errorMessage += `1. Upload files directly: Use the "Single Video Upload" feature to upload files to the server first.\n`;
        errorMessage += `2. Copy files to server: Use SCP, FTP, or file manager to copy files to a server-accessible location.\n`;
        errorMessage += `3. Use server paths: Update your CSV to use paths that are accessible from the server (e.g., /home/user/videos/ or mounted network drives).\n`;
        errorMessage += `4. Mount Windows drive: If both systems are on the same network, mount the Windows drive on the Linux server.\n\n`;
        errorMessage += `Example error: ${copyStats.errors[0]}`;
      } else {
        errorMessage += `Errors:\n${copyStats.errors.slice(0, 5).join('\n')}${copyStats.errors.length > 5 ? `\n... and ${copyStats.errors.length - 5} more` : ''}`;
      }
      
      return NextResponse.json(
        {
          error: errorMessage,
          details: {
            videosCopied: copyStats.videosCopied,
            videosSkipped: copyStats.videosSkipped,
            errors: copyStats.errors,
            allWindowsPathErrors: allWindowsPathErrors,
          },
        },
        { status: 400 }
      );
    }

    // Write updated CSV with server paths
    // Note: CSV fields with newlines must be quoted, and quotes must be escaped
    if (updatedRows.length > 0) {
      const headers = Object.keys(updatedRows[0]);
      console.log(`[UPLOAD-QUEUE] Writing CSV with headers:`, headers);
      console.log(`[UPLOAD-QUEUE] First row before writing:`, {
        youtube_title: updatedRows[0].youtube_title ? `"${updatedRows[0].youtube_title.substring(0, 50)}..."` : 'MISSING',
        youtube_description: updatedRows[0].youtube_description ? `"${updatedRows[0].youtube_description.substring(0, 50)}..."` : 'MISSING',
        path: updatedRows[0].path || 'MISSING',
        allKeys: Object.keys(updatedRows[0])
      });
      
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
      console.log(`[UPLOAD-QUEUE] CSV written to: ${csvPath}`);
      console.log(`[UPLOAD-QUEUE] CSV content preview (first 500 chars):`, csvContent.substring(0, 500));
    }

    // Add to queue only if we have successfully copied videos
    const queueId = addToQueue({
      sessionId,
      userId: userId,
      csvPath,
      uploadDir,
      videosPerDay: videosPerDay || 0, // Backward compatibility
      startDate: scheduleStartDate || new Date().toISOString(),
      uploadInterval: enableScheduling && uploadInterval ? uploadInterval as "day" | "hour" | "12hours" | "6hours" | "30mins" | "10mins" | "custom" : undefined,
      videosPerInterval: videosPerInterval || undefined,
      customIntervalMinutes: customIntervalMinutes,
      totalVideos: updatedRows.length, // Use actual copied rows, not original CSV length
    });

    console.log(`[UPLOAD-QUEUE] Job ${queueId} created with ${updatedRows.length} videos ready for upload`);

    // Build response message
    let message = `Successfully queued ${updatedRows.length} video(s) for processing`;
    if (copyStats.errors.length > 0) {
      message += `. ${copyStats.errors.length} error(s) occurred during file copy.`;
    }

    return NextResponse.json({
      success: true,
      jobId: queueId,
      message: message,
      totalVideos: updatedRows.length,
      copyStats: {
        videosCopied: copyStats.videosCopied,
        videosSkipped: copyStats.videosSkipped,
        thumbnailsCopied: copyStats.thumbnailsCopied,
        thumbnailsSkipped: copyStats.thumbnailsSkipped,
        errors: copyStats.errors,
      },
    });
  } catch (error: any) {
    console.error("=== BULK UPLOAD ERROR ===");
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error("Error status:", error?.status);
    console.error("Error response:", error?.response?.data);
    console.error("Stack trace:", error?.stack);
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("==========================");
    
    // Return more detailed error information
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        "Failed to queue upload";
    const errorDetails = error?.response?.data?.error || error?.response?.data || null;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        code: error?.code,
        status: error?.status
      },
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
      // Update session with userId and persist it
      session.userId = userId;
      setSession(sessionId, session);
    }

    const queue = getQueue();
    
    // Migrate old jobs: if a job has sessionId matching current session but no userId, add userId
    // This helps recover jobs after refresh when sessionId might change
    let queueUpdated = false;
    const migratedQueue = queue.map(item => {
      if (!item.userId && item.sessionId === sessionId && userId) {
        queueUpdated = true;
        return { ...item, userId };
      }
      return item;
    });
    
    if (queueUpdated) {
      // Write migrated queue back to disk using the queue module's write function
      const { writeQueue } = require("@/lib/queue");
      // We need to import writeQueue properly - for now, write directly
      const QUEUE_FILE = path.join(process.cwd(), "data", "queue.json");
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(migratedQueue, null, 2));
      console.log(`[UPLOAD-QUEUE] Migrated jobs with userId for session ${sessionId.substring(0, 10)}...`);
    }
    
    // Filter by userId (persistent) or fallback to sessionId (backward compatibility)
    // Also filter out cancelled jobs (they should be removed, but filter just in case)
    const queueToFilter = queueUpdated ? migratedQueue : queue;
    const userQueue = queueToFilter.filter(item => {
      const matchesUser = (item.userId && item.userId === userId) || 
                         (!item.userId && item.sessionId === sessionId);
      const notCancelled = item.status !== "failed" || item.progress?.some(p => p.status.includes("Uploaded"));
      return matchesUser && notCancelled;
    });

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

