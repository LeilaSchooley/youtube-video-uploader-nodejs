import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { readSheetData, extractSpreadsheetId, getSpreadsheetMetadata } from "@/lib/sheets";
import { addToBulkQueue } from "@/lib/bulk-queue";

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
      videosPerDay,
      startDate,
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
      mapped.privacyStatus = normalized.privacystatus || normalized.privacyStatus || row.privacyStatus || row.privacystatus || "private";
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

    // Convert to queue items
    const queueItems = normalizedData.map((row, index) => ({
      title: row.youtube_title || `Video ${index + 1}`,
      description: row.youtube_description || "",
      privacyStatus: (row.privacyStatus || "private") as "public" | "private" | "unlisted",
      scheduleTime: row.scheduleTime || undefined,
      videoUrl: row.video_url || undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      driveFileId: row.drive_file_id || undefined,
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
    }));

    // Add to bulk queue
    const jobId = addToBulkQueue({
      sessionId,
      userId,
      type: "urls", // Sheets data is treated like URLs/Drive (streaming)
      videosPerDay: videosPerDay ? parseInt(videosPerDay, 10) : undefined,
      startDate: startDate || undefined,
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
