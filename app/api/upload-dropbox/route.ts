import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { listDropboxVideosRecursive, listDropboxVideos, downloadDropboxFile } from "@/lib/dropbox";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { Readable } from "stream";
import { checkDuplicatesBatch } from "@/lib/youtube-utils";
const csvParser = require("csv-parser");
// Use require for xlsx to avoid TypeScript module resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require("xlsx") as typeof import("xlsx");

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

/**
 * POST /api/upload-dropbox
 * Upload videos from a Dropbox folder
 * 
 * Body:
 * - dropboxFolderPath: string (required) - Dropbox folder path (e.g., "/Videos")
 * - recursive: boolean (optional) - Scan subfolders (default: false)
 * - postUploadAction: "rename" | "delete" | "move" | "none" (optional, default: "none")
 * - completedFolderPath: string (optional) - Required if postUploadAction is "move"
 * - privacyStatus: "public" | "private" | "unlisted" (optional, default: "public")
 * - videosPerDay: number (optional) - Number of videos to upload per day for scheduling
 * - dropboxCsvPath: string (optional) - Path to CSV/XLSX file in Dropbox for metadata matching
 * - useWorker: boolean (optional, default: true)
 */
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

    // Get userId/email from session (needed for GAT owner check)
    let userId = session.userId;
    let userEmail: string | undefined;
    if (!userId) {
      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(session.tokens);
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
      userEmail = userInfo.data.email || undefined;
      session.userId = userId;
      setSession(sessionId, session);
    } else {
      // userId might be email, try to extract email
      userEmail = userId.includes('@') ? userId : undefined;
    }

    // Get Dropbox token - checks GAT from env first (only for owner), then session token, auto-refreshes if needed
    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
      userEmail
    );
    if (!dropboxToken) {
      return NextResponse.json(
        { error: "Dropbox not connected. Please connect Dropbox first or set DROPBOX_GENERATED_ACCESS_TOKEN in environment variables." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      dropboxFolderPath,
      recursive = false,
      postUploadAction = "none",
      completedFolderPath,
      privacyStatus = "public",
      videosPerDay,
      useWorker = true,
      dropboxCsvPath, // Optional CSV file path from Dropbox for metadata
    } = body;

    if (!dropboxFolderPath) {
      return NextResponse.json(
        { error: "dropboxFolderPath is required" },
        { status: 400 }
      );
    }

    // Ensure path starts with /
    const normalizedPath = dropboxFolderPath.startsWith('/') ? dropboxFolderPath : `/${dropboxFolderPath}`;

    if (postUploadAction === "move" && !completedFolderPath) {
      return NextResponse.json(
        { error: "completedFolderPath is required when postUploadAction is 'move'" },
        { status: 400 }
      );
    }

    console.log(`[UPLOAD-DROPBOX] Scanning folder: ${normalizedPath}`);

    // List videos in folder
    let videos;
    let currentDropboxToken = dropboxToken; // Track token in case it gets refreshed
    try {
      if (recursive) {
        videos = await listDropboxVideosRecursive(normalizedPath, dropboxToken, 10, sessionId, session.dropboxRefreshToken);
      } else {
        videos = await listDropboxVideos(normalizedPath, dropboxToken, sessionId, session.dropboxRefreshToken);
      }
      // Re-fetch token in case it was refreshed during listing
      const refreshedSession = getSession(sessionId);
      if (refreshedSession?.dropboxToken && refreshedSession.dropboxToken !== dropboxToken) {
        currentDropboxToken = refreshedSession.dropboxToken;
        console.log(`[UPLOAD-DROPBOX] Token was refreshed during listing, using updated token`);
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to list videos: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: "No video files found in the specified Dropbox folder" },
        { status: 400 }
      );
    }

    // Parse CSV/XLSX metadata if provided
    let csvMetadataMap: Map<string, any> = new Map();
    if (dropboxCsvPath) {
      try {
        console.log(`[UPLOAD-DROPBOX] Downloading spreadsheet from: ${dropboxCsvPath}`);
        const fileStream = await downloadDropboxFile(dropboxCsvPath, currentDropboxToken, sessionId, session.dropboxRefreshToken);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
          chunks.push(Buffer.from(chunk));
        }
        const fileBuffer = Buffer.concat(chunks);
        
        // Check file extension to determine parser
        const fileExtension = dropboxCsvPath.toLowerCase().split('.').pop();
        let csvData: any[] = [];
        
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          // Parse XLSX/XLS file
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          csvData = XLSX.utils.sheet_to_json(worksheet);
          console.log(`[UPLOAD-DROPBOX] Parsed ${csvData.length} rows from XLSX/XLS`);
        } else {
          // Parse CSV file
          await new Promise<void>((resolve, reject) => {
            Readable.from(fileBuffer)
              .pipe(csvParser())
              .on("data", (row: any) => {
                csvData.push(row);
              })
              .on("end", () => {
                console.log(`[UPLOAD-DROPBOX] Parsed ${csvData.length} rows from CSV`);
                resolve();
              })
              .on("error", (err: any) => {
                reject(new Error(`Failed to parse CSV: ${err.message}`));
              });
          });
        }

        // Create map of video_name -> CSV row metadata
        csvData.forEach((row) => {
          const videoName = row.video_name?.toLowerCase().trim();
          if (videoName) {
            csvMetadataMap.set(videoName, row);
          }
        });
        
        console.log(`[UPLOAD-DROPBOX] Created metadata map with ${csvMetadataMap.size} entries`);
      } catch (error: any) {
        console.error(`[UPLOAD-DROPBOX] Error parsing spreadsheet:`, error);
        return NextResponse.json(
          { error: `Failed to parse spreadsheet file: ${error?.message || "Unknown error"}` },
          { status: 400 }
        );
      }
    }

    // Helper function to match video_name to Dropbox file
    const matchCsvMetadata = (videoName: string): any | undefined => {
      if (!videoName || csvMetadataMap.size === 0) {
        return undefined;
      }
      
      const normalizedName = videoName.toLowerCase().trim();
      const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, "");
      
      // Try exact match first (with extension)
      if (csvMetadataMap.has(normalizedName)) {
        return csvMetadataMap.get(normalizedName);
      }
      
      // Try match without extension
      if (csvMetadataMap.has(nameWithoutExt)) {
        return csvMetadataMap.get(nameWithoutExt);
      }
      
      // Try partial match
      for (const [csvVideoName, metadata] of Array.from(csvMetadataMap.entries())) {
        if (csvVideoName.includes(normalizedName) || normalizedName.includes(csvVideoName)) {
          return metadata;
        }
      }
      
      return undefined;
    };

    // If useWorker, queue for background processing
    if (useWorker) {
      let matchedCount = 0;
      let unmatchedCount = 0;
      const unmatchedVideos: string[] = [];
      
      // If CSV is provided, ONLY queue videos that match CSV entries (like Google Sheets)
      // If no CSV is provided, upload all videos with default metadata
      const hasCsvMetadata = csvMetadataMap.size > 0;
      
      const allQueueItems = videos.map((video) => {
        const videoName = video.name.toLowerCase();
        const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
        const csvMetadata = matchCsvMetadata(videoName) || matchCsvMetadata(nameWithoutExt);
        
        if (csvMetadata) {
          matchedCount++;
          // Use CSV metadata
          // Map publishAt/scheduleTime to publishDate (expected by worker)
          const publishDate = csvMetadata?.publishAt || csvMetadata?.publishat || 
                             csvMetadata?.scheduleTime || csvMetadata?.scheduletime || 
                             undefined;
          
          return {
            title: csvMetadata?.youtube_title || video.name.replace(/\.[^/.]+$/, ""),
            description: csvMetadata?.youtube_description || `Uploaded from Dropbox: ${video.name}`,
            privacyStatus: (csvMetadata?.privacyStatus || csvMetadata?.privacystatus || privacyStatus) as "public" | "private" | "unlisted",
            dropboxFileId: video.pathLower || video.id,
            postUploadAction: csvMetadata?.post_upload_action || csvMetadata?.postuploadaction || (postUploadAction !== "none" ? postUploadAction : undefined),
            completedFolderId: csvMetadata?.completed_folder_id || csvMetadata?.completedfolderid || completedFolderPath || undefined,
            publishDate: publishDate, // Worker expects publishDate, not scheduleTime
            thumbnailUrl: csvMetadata?.thumbnail_url || undefined,
            urlAuthHeaders: csvMetadata?.url_auth_headers || undefined,
            urlTimeout: csvMetadata?.url_timeout || undefined,
            madeForKids: csvMetadata?.made_for_kids || csvMetadata?.madeforkids || csvMetadata?.selfDeclaredMadeForKids || undefined,
          };
        } else {
          unmatchedCount++;
          unmatchedVideos.push(video.name);
          
          // If CSV is provided, skip videos without matches (filter them out)
          if (hasCsvMetadata) {
            return null; // Will be filtered out
          }
          
          // No CSV provided - upload with defaults (still upload the video)
          return {
            title: video.name.replace(/\.[^/.]+$/, ""),
            description: `Uploaded from Dropbox: ${video.name}`,
            privacyStatus: privacyStatus as "public" | "private" | "unlisted",
            dropboxFileId: video.pathLower || video.id,
            postUploadAction: postUploadAction !== "none" ? postUploadAction : undefined,
            completedFolderId: completedFolderPath || undefined,
          };
        }
      });
      
      // Filter out null entries (videos without CSV matches when CSV is provided)
      let queueItems = allQueueItems.filter((item): item is NonNullable<typeof item> => item !== null);
      
      const filteredCount = allQueueItems.length - queueItems.length;
      
      console.log(`[UPLOAD-DROPBOX] Processing ${videos.length} videos from folder`);
      if (hasCsvMetadata) {
        console.log(`[UPLOAD-DROPBOX] CSV provided: ${matchedCount} matched CSV entries, ${filteredCount} filtered out (no CSV match)`);
        if (unmatchedCount > 0) {
          console.log(`[UPLOAD-DROPBOX] Filtered videos (no CSV match): ${unmatchedVideos.slice(0, 10).join(', ')}${unmatchedCount > 10 ? `... and ${unmatchedCount - 10} more` : ''}`);
        }
      } else {
        console.log(`[UPLOAD-DROPBOX] No CSV provided: ${queueItems.length} videos will be uploaded with default metadata`);
      }

      if (queueItems.length === 0) {
        if (hasCsvMetadata) {
          return NextResponse.json(
            { 
              error: `No videos matched CSV entries. Found ${videos.length} videos in folder, but none matched the ${csvMetadataMap.size} video_name entries in the CSV.`,
              totalVideos: videos.length,
              csvEntries: csvMetadataMap.size,
              matchedCount: 0,
              filteredCount: unmatchedCount
            },
            { status: 400 }
          );
        } else {
          return NextResponse.json(
            { error: `No videos found to upload. Found ${videos.length} videos in folder.` },
            { status: 400 }
          );
        }
      }

      // Check for duplicates on YouTube channel before queuing
      let duplicateCount = 0;
      if (queueItems.length > 0) {
        try {
          const oAuthClient = getOAuthClient();
          oAuthClient.setCredentials(session.tokens);
          const youtube = google.youtube({
            version: "v3",
            auth: oAuthClient,
          });
          
          const titles = queueItems.map(item => item.title || '').filter(t => t.trim());
          console.log(`[UPLOAD-DROPBOX] Checking ${titles.length} videos for duplicates on YouTube channel...`);
          
          const duplicates = await checkDuplicatesBatch(youtube, titles);
          duplicateCount = duplicates.size;
          
          if (duplicateCount > 0) {
            console.log(`[UPLOAD-DROPBOX] Found ${duplicateCount} duplicate video(s) already on channel, filtering them out`);
            
            // Filter out duplicates
            queueItems = queueItems.filter(item => {
              const title = item.title || '';
              const isDuplicate = duplicates.has(title.trim());
              if (isDuplicate) {
                console.log(`[UPLOAD-DROPBOX] Skipping duplicate: "${title.substring(0, 50)}..."`);
              }
              return !isDuplicate;
            });
          } else {
            console.log(`[UPLOAD-DROPBOX] No duplicates found, all ${queueItems.length} videos are new`);
          }
        } catch (error: any) {
          console.warn(`[UPLOAD-DROPBOX] Error checking for duplicates: ${error?.message || error}. Continuing without duplicate check.`);
          // Continue without duplicate check if it fails
        }
      }

      if (queueItems.length === 0) {
        return NextResponse.json(
          { 
            error: `All videos were filtered out. ${duplicateCount > 0 ? `${duplicateCount} duplicate(s) already on channel. ` : ''}No new videos to upload.`,
            totalVideos: videos.length,
            duplicateCount,
            filteredCount: hasCsvMetadata ? unmatchedCount : 0,
          },
          { status: 400 }
        );
      }

      const jobId = addToBulkQueue({
        sessionId,
        userId,
        type: "urls", // Dropbox files are streamed similar to URLs
        items: queueItems,
        videosPerDay: videosPerDay && videosPerDay > 0 ? videosPerDay : undefined,
        startDate: videosPerDay && videosPerDay > 0 ? new Date().toISOString() : undefined, // Start from today if scheduling
      });

      const warnings: string[] = [];
      if (hasCsvMetadata && unmatchedCount > 0) {
        warnings.push(`${unmatchedCount} filtered out (no CSV match)`);
      }
      if (duplicateCount > 0) {
        warnings.push(`${duplicateCount} duplicate(s) skipped (already on channel)`);
      }

      return NextResponse.json({
        success: true,
        message: hasCsvMetadata 
          ? `Upload queued: ${queueItems.length} videos matched CSV entries${warnings.length > 0 ? `, ${warnings.join(', ')}` : ''}`
          : `Upload queued: ${queueItems.length} videos${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped)` : ''}`,
        jobId,
        totalItems: queueItems.length,
        totalVideos: videos.length,
        matchedFromCsv: hasCsvMetadata ? matchedCount : undefined,
        filteredCount: hasCsvMetadata ? unmatchedCount : undefined,
        duplicateCount,
        folderPath: normalizedPath,
      });
    } else {
      // Direct upload (not implemented for Dropbox - use worker)
      return NextResponse.json(
        { error: "Direct upload not supported for Dropbox. Please use worker mode." },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[UPLOAD-DROPBOX] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error processing Dropbox folder" },
      { status: 500 }
    );
  }
}
