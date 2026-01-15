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
              error: `Windows path detected on ${process.platform} server. File must be accessible from server. Original: ${filePath}`
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

      // Copy video file if it exists
      if (row.path) {
        const fileCheck = checkFileExists(row.path, 'Video', i);
        
        if (fileCheck.exists) {
          try {
            // Sanitize filename to handle special characters
            const videoFilename = path.basename(fileCheck.normalizedPath)
              .replace(/[<>:"|?*]/g, '_') // Replace invalid filename chars
              .replace(/\s+/g, '_'); // Replace spaces with underscores
            
            const videoDest = path.join(uploadDir, "videos", videoFilename);
            
            console.log(`[UPLOAD-QUEUE] Copying video ${i + 1}: ${fileCheck.normalizedPath} -> ${videoDest}`);
            
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
            console.log(`[UPLOAD-QUEUE] ✓ Video ${i + 1} copied successfully`);
          } catch (error: any) {
            const errorMsg = `Video ${i + 1}: Copy failed - ${error?.message || 'Unknown error'}. Source: ${row.path}`;
            console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`, error);
            copyStats.errors.push(errorMsg);
            copyStats.videosSkipped++;
            // Don't add row if video copy failed - it's required
            continue;
          }
        } else {
          const errorMsg = `Video ${i + 1}: ${fileCheck.error || 'File not found'}. Path: ${row.path}`;
          console.error(`[UPLOAD-QUEUE] [ERROR] ${errorMsg}`);
          copyStats.errors.push(errorMsg);
          copyStats.videosSkipped++;
          // Don't add row if video file doesn't exist - it's required
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
        const fileCheck = checkFileExists(row.thumbnail_path, 'Thumbnail', i);
        
        if (fileCheck.exists) {
          try {
            const thumbFilename = path.basename(fileCheck.normalizedPath)
              .replace(/[<>:"|?*]/g, '_')
              .replace(/\s+/g, '_');
            
            const thumbDest = path.join(uploadDir, "thumbnails", thumbFilename);
            
            console.log(`[UPLOAD-QUEUE] Copying thumbnail ${i + 1}: ${fileCheck.normalizedPath} -> ${thumbDest}`);
            
            const destDir = path.dirname(thumbDest);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.copyFileSync(fileCheck.normalizedPath, thumbDest);
            updatedRow.thumbnail_path = thumbDest;
            copyStats.thumbnailsCopied++;
            console.log(`[UPLOAD-QUEUE] ✓ Thumbnail ${i + 1} copied successfully`);
          } catch (error: any) {
            const errorMsg = `Thumbnail ${i + 1}: Copy failed - ${error?.message || 'Unknown error'}`;
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

      updatedRows.push(updatedRow);
    }

    // Fail the entire job if no videos were copied successfully
    if (copyStats.videosCopied === 0) {
      console.error(`[UPLOAD-QUEUE] [ERROR] No videos were copied successfully. Errors:`, copyStats.errors);
      return NextResponse.json(
        {
          error: `Failed to copy video files. ${copyStats.errors.length} error(s): ${copyStats.errors.slice(0, 3).join('; ')}${copyStats.errors.length > 3 ? '...' : ''}`,
          details: {
            videosCopied: copyStats.videosCopied,
            videosSkipped: copyStats.videosSkipped,
            errors: copyStats.errors,
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
      videosPerDay: videosPerDay || 0,
      startDate: scheduleStartDate || new Date().toISOString(),
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
      // Update session with userId
      session.userId = userId;
    }

    const queue = getQueue();
    // Filter by userId (persistent) or fallback to sessionId (backward compatibility)
    // Also filter out cancelled jobs (they should be removed, but filter just in case)
    const userQueue = queue.filter(item => {
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

