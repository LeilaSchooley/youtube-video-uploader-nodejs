import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { cookies } from "next/headers";
import { readSheetData, extractSpreadsheetId, getSpreadsheetMetadata } from "@/lib/sheets";

export const dynamic = 'force-dynamic';
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
 * POST /api/preview-sheets
 * Preview a Google Sheet to see how many videos will be uploaded
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

    // Analyze data
    const totalRows = normalizedData.length;
    const previewRows = normalizedData.slice(0, 10); // First 10 rows for preview
    
    // Count valid rows (rows with at least title or description)
    const validRows = normalizedData.filter(row => 
      row.youtube_title || row.youtube_description
    ).length;

    // Count rows with video sources
    const rowsWithVideoSource = normalizedData.filter(row =>
      row.video_url || row.drive_file_id || row.path
    ).length;

    // Count rows with thumbnails
    const rowsWithThumbnails = normalizedData.filter(row =>
      row.thumbnail_url || row.drive_thumbnail_id || row.thumbnail_path
    ).length;

    // Get column names from first row
    const columns = Object.keys(normalizedData[0] || {});

    return NextResponse.json({
      success: true,
      spreadsheetTitle: metadata.title,
      sheetName: sheetName || metadata.sheets[0]?.title || "Sheet1",
      totalRows,
      validRows,
      rowsWithVideoSource,
      rowsWithThumbnails,
      previewRows,
      columns,
    });
  } catch (error: any) {
    console.error("[PREVIEW-SHEETS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error previewing Google Sheet" },
      { status: 500 }
    );
  }
}
