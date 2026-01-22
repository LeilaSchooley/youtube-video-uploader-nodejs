import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { readSheetData, extractSpreadsheetId, getSpreadsheetMetadata } from "@/lib/sheets";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { listDriveVideos } from "@/lib/drive";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

interface SheetRow {
  youtube_title?: string;
  youtube_description?: string;
  video_name?: string;
  thumbnail_name?: string;
  thumbnail_path?: string;
  path?: string;
  video_url?: string;
  thumbnail_url?: string;
  drive_file_id?: string;
  drive_thumbnail_id?: string;
  url_auth_headers?: string;
  url_timeout?: string;
  scheduletime?: string;
  scheduleTime?: string;
  privacystatus?: string;
  privacyStatus?: string;
  post_upload_action?: string;
  postuploadaction?: string;
  completed_folder_id?: string;
  completedfolderid?: string;
  made_for_kids?: string; // "true", "false", "yes", "no", "1", "0"
  madeforkids?: string;
  selfDeclaredMadeForKids?: string;
}

/**
 * POST /api/upload-sheets
 * Upload videos from a Google Sheet
 * 
 * Body:
 * - spreadsheetUrl: string (required) - Google Sheets URL or ID
 * - sheetName: string (optional) - Sheet name (default: first sheet)
 * - range: string (optional) - Range to read (default: entire sheet)
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

    const body = await request.json();
    const {
      spreadsheetUrl,
      sheetName,
      range,
      driveFolderId,
      videosPerDay,
      // startDate is no longer required - will use today if videosPerDay is set
    } = body;

    if (!spreadsheetUrl) {
      return NextResponse.json(
        { error: "spreadsheetUrl is required" },
        { status: 400 }
      );
    }

    // Extract spreadsheet ID
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Invalid Google Sheets URL or ID" },
        { status: 400 }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    // Get spreadsheet metadata
    let metadata;
    try {
      metadata = await getSpreadsheetMetadata(spreadsheetId, oAuthClient);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to access Google Sheet: ${error?.message || "Unknown error"}` },
        { status: 400 }
      );
    }

    // Determine range
    let sheetRange: string;
    if (range) {
      sheetRange = range;
    } else if (sheetName) {
      sheetRange = `${sheetName}!A:Z`;
    } else if (metadata.sheets.length > 0) {
      sheetRange = `${metadata.sheets[0].title}!A:Z`;
    } else {
      sheetRange = "A:Z";
    }

    // Read sheet data
    let sheetData: SheetRow[];
    try {
      sheetData = await readSheetData(spreadsheetId, sheetRange, oAuthClient);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to read sheet data: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    if (sheetData.length === 0) {
      return NextResponse.json(
        { error: "No data found in the specified sheet range" },
        { status: 400 }
      );
    }

    // Normalize column names (handle case variations)
    const normalizedData = sheetData.map(row => {
      const normalized: SheetRow = {};
      
      // Normalize all keys to lowercase for easier matching
      Object.keys(row).forEach(key => {
        const lowerKey = key.toLowerCase();
        normalized[lowerKey as keyof SheetRow] = row[key as keyof SheetRow];
      });

      // Map common variations
      const mapped: any = {};
      mapped.youtube_title = normalized.youtube_title || row.youtube_title;
      mapped.youtube_description = normalized.youtube_description || row.youtube_description;
      mapped.video_name = normalized.video_name || row.video_name;
      mapped.thumbnail_name = normalized.thumbnail_name || row.thumbnail_name;
      mapped.thumbnail_path = normalized.thumbnail_path || row.thumbnail_path;
      mapped.path = normalized.path || row.path;
      mapped.video_url = normalized.video_url || row.video_url;
      mapped.thumbnail_url = normalized.thumbnail_url || row.thumbnail_url;
      mapped.drive_file_id = normalized.drive_file_id || row.drive_file_id;
      mapped.drive_thumbnail_id = normalized.drive_thumbnail_id || row.drive_thumbnail_id;
      mapped.url_auth_headers = normalized.url_auth_headers || row.url_auth_headers;
      mapped.url_timeout = normalized.url_timeout || row.url_timeout;
      mapped.scheduleTime = normalized.scheduletime || normalized.scheduleTime || row.scheduleTime || row.scheduletime;
      mapped.privacyStatus = normalized.privacystatus || normalized.privacyStatus || row.privacyStatus || row.privacystatus || "public";
      mapped.post_upload_action = normalized.post_upload_action || normalized.postuploadaction || row.post_upload_action || row.postuploadaction || "none";
      mapped.completed_folder_id = normalized.completed_folder_id || normalized.completedfolderid || row.completed_folder_id || row.completedfolderid;

      return mapped;
    });

    // Get userId from session
    let userId = session.userId;
    if (!userId) {
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
      session.userId = userId;
      setSession(sessionId, session);
    }

    // If driveFolderId is provided, match video_name to Drive files
    let driveFilesMap: Map<string, string> = new Map();
    if (driveFolderId) {
      try {
        const driveVideos = await listDriveVideos(driveFolderId, oAuthClient);
        
        // Create a map of filename (without extension) -> file ID
        // Also create a map with full filename -> file ID for exact matches
        driveVideos.forEach(file => {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "").toLowerCase();
          const fullName = file.name.toLowerCase();
          
          // Store both mappings (prefer exact match)
          if (!driveFilesMap.has(fullName)) {
            driveFilesMap.set(fullName, file.id);
          }
          if (!driveFilesMap.has(nameWithoutExt)) {
            driveFilesMap.set(nameWithoutExt, file.id);
          }
        });
        
        console.log(`[UPLOAD-SHEETS] Found ${driveVideos.length} videos in Drive folder, matched ${driveFilesMap.size} filename mappings`);
      } catch (error: any) {
        console.error(`[UPLOAD-SHEETS] Error listing Drive folder:`, error);
        return NextResponse.json(
          { error: `Failed to access Drive folder: ${error?.message || "Unknown error"}` },
          { status: 400 }
        );
      }
    }

    // Helper function to match video_name to Drive file
    const matchDriveFile = (videoName: string | undefined): string | undefined => {
      if (!videoName || !driveFolderId || driveFilesMap.size === 0) {
        return undefined;
      }
      
      const normalizedName = videoName.toLowerCase().trim();
      const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, "");
      
      // Try exact match first (with extension)
      if (driveFilesMap.has(normalizedName)) {
        return driveFilesMap.get(normalizedName);
      }
      
      // Try match without extension
      if (driveFilesMap.has(nameWithoutExt)) {
        return driveFilesMap.get(nameWithoutExt);
      }
      
      // Try partial match (filename contains video_name or vice versa)
      for (const [driveFileName, fileId] of driveFilesMap.entries()) {
        if (driveFileName.includes(normalizedName) || normalizedName.includes(driveFileName)) {
          return fileId;
        }
      }
      
      return undefined;
    };

    // Convert to queue items
    const queueItems = normalizedData.map((row, index) => {
      // Match video_name to Drive file if driveFolderId is provided
      let matchedDriveFileId = row.drive_file_id;
      if (driveFolderId && row.video_name && !matchedDriveFileId) {
        matchedDriveFileId = matchDriveFile(row.video_name);
        if (matchedDriveFileId) {
          console.log(`[UPLOAD-SHEETS] Matched "${row.video_name}" to Drive file ${matchedDriveFileId}`);
        } else {
          console.warn(`[UPLOAD-SHEETS] Could not match "${row.video_name}" to any Drive file`);
        }
      }
      
      return {
        title: row.youtube_title || `Video ${index + 1}`,
        description: row.youtube_description || "",
        privacyStatus: (row.privacyStatus || "public") as "public" | "private" | "unlisted",
        scheduleTime: row.scheduleTime || undefined,
        videoUrl: row.video_url || undefined,
        thumbnailUrl: row.thumbnail_url || undefined,
        driveFileId: matchedDriveFileId || row.drive_file_id || undefined,
        driveThumbnailId: row.drive_thumbnail_id || undefined,
        authHeaders: row.url_auth_headers ? (() => {
          try {
            return JSON.parse(row.url_auth_headers);
          } catch {
            return undefined;
          }
        })() : undefined,
        timeout: row.url_timeout ? parseInt(row.url_timeout, 10) : undefined,
        postUploadAction: row.post_upload_action || "none",
        completedFolderId: row.completed_folder_id || undefined,
        madeForKids: (row as any).made_for_kids ?? false, // Default to false (not made for kids)
      };
    });

    // Add to bulk queue
    // If videosPerDay is set, use today as startDate (will be calculated in worker)
    const jobId = addToBulkQueue({
      sessionId,
      userId,
      type: "urls", // Sheets data is treated like URLs/Drive (streaming)
      videosPerDay: videosPerDay ? parseInt(videosPerDay, 10) : undefined,
      // startDate will be calculated in worker based on today if videosPerDay is set
      items: queueItems,
    });

    return NextResponse.json({
      success: true,
      message: "Upload queued for processing",
      jobId,
      totalItems: queueItems.length,
      spreadsheetTitle: metadata.title,
      sheetName: sheetName || metadata.sheets[0]?.title || "Sheet1",
    });
  } catch (error: any) {
    console.error("[UPLOAD-SHEETS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error processing Google Sheet" },
      { status: 500 }
    );
  }
}
