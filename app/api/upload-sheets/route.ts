import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import {
  readSheetData,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
} from "@/lib/sheets";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { listDriveVideos } from "@/lib/drive";
import { listDropboxVideos } from "@/lib/dropbox";
import { getUploadedTitlesSet } from "@/lib/uploaded-videos";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

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
  publishAt?: string; // Support publishAt column
  publishat?: string;
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
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const body = await request.json();
    const {
      spreadsheetUrl,
      sheetName,
      range,
      driveFolderId,
      dropboxFolderPath,
      videosPerDay,
      // startDate is no longer required - will use today if videosPerDay is set
    } = body;

    if (!spreadsheetUrl) {
      return NextResponse.json(
        { error: "spreadsheetUrl is required" },
        { status: 400 },
      );
    }

    // Extract spreadsheet ID
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Invalid Google Sheets URL or ID" },
        { status: 400 },
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
        {
          error: `Failed to access Google Sheet: ${error?.message || "Unknown error"}`,
        },
        { status: 400 },
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
        {
          error: `Failed to read sheet data: ${error?.message || "Unknown error"}`,
        },
        { status: 500 },
      );
    }

    if (sheetData.length === 0) {
      return NextResponse.json(
        { error: "No data found in the specified sheet range" },
        { status: 400 },
      );
    }

    // Normalize column names (handle case variations)
    const normalizedData = sheetData.map((row) => {
      const normalized: SheetRow = {};

      // Normalize all keys to lowercase for easier matching
      Object.keys(row).forEach((key) => {
        const lowerKey = key.toLowerCase();
        normalized[lowerKey as keyof SheetRow] = row[key as keyof SheetRow];
      });

      // Map common variations
      const mapped: any = {};
      mapped.youtube_title = normalized.youtube_title || row.youtube_title;
      mapped.youtube_description =
        normalized.youtube_description || row.youtube_description;
      mapped.video_name = normalized.video_name || row.video_name;
      mapped.thumbnail_name = normalized.thumbnail_name || row.thumbnail_name;
      mapped.thumbnail_path = normalized.thumbnail_path || row.thumbnail_path;
      mapped.path = normalized.path || row.path;
      mapped.video_url = normalized.video_url || row.video_url;
      mapped.thumbnail_url = normalized.thumbnail_url || row.thumbnail_url;
      mapped.drive_file_id = normalized.drive_file_id || row.drive_file_id;
      mapped.drive_thumbnail_id =
        normalized.drive_thumbnail_id || row.drive_thumbnail_id;
      mapped.url_auth_headers =
        normalized.url_auth_headers || row.url_auth_headers;
      mapped.url_timeout = normalized.url_timeout || row.url_timeout;
      mapped.scheduleTime =
        normalized.scheduletime ||
        normalized.scheduleTime ||
        row.scheduleTime ||
        row.scheduletime;
      mapped.publishAt =
        normalized.publishat ||
        normalized.publishAt ||
        row.publishAt ||
        row.publishat; // Support publishAt column
      mapped.privacyStatus =
        normalized.privacystatus ||
        normalized.privacyStatus ||
        row.privacyStatus ||
        row.privacystatus ||
        "public";
      mapped.post_upload_action =
        normalized.post_upload_action ||
        normalized.postuploadaction ||
        row.post_upload_action ||
        row.postuploadaction ||
        "none";
      mapped.completed_folder_id =
        normalized.completed_folder_id ||
        normalized.completedfolderid ||
        row.completed_folder_id ||
        row.completedfolderid;

      return mapped;
    });

    // Ensure userId is set on session
    let userId = session.userId;
    if (!userId) {
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as
        | string
        | undefined;
      session.userId = userId;
      setSession(sessionId, session);
    }

    const dropboxToken = dropboxFolderPath
      ? await getDropboxToken(
          session.dropboxToken,
          session.dropboxRefreshToken,
          sessionId,
        )
      : undefined;

    // If driveFolderId is provided, match video_name to Drive files
    let driveFilesMap: Map<string, string> = new Map();
    if (driveFolderId) {
      try {
        const driveVideos = await listDriveVideos(driveFolderId, oAuthClient);

        // Create a map of filename (without extension) -> file ID
        // Also create a map with full filename -> file ID for exact matches
        driveVideos.forEach((file) => {
          const nameWithoutExt = file.name
            .replace(/\.[^/.]+$/, "")
            .toLowerCase();
          const fullName = file.name.toLowerCase();

          // Store both mappings (prefer exact match)
          if (!driveFilesMap.has(fullName)) {
            driveFilesMap.set(fullName, file.id);
          }
          if (!driveFilesMap.has(nameWithoutExt)) {
            driveFilesMap.set(nameWithoutExt, file.id);
          }
        });

        console.log(
          `[UPLOAD-SHEETS] Found ${driveVideos.length} videos in Drive folder, matched ${driveFilesMap.size} filename mappings`,
        );
      } catch (error: any) {
        console.error(`[UPLOAD-SHEETS] Error listing Drive folder:`, error);
        return NextResponse.json(
          {
            error: `Failed to access Drive folder: ${error?.message || "Unknown error"}`,
          },
          { status: 400 },
        );
      }
    }

    // If dropboxFolderPath is provided, match video_name to Dropbox files
    let dropboxFilesMap: Map<string, string> = new Map();
    if (dropboxFolderPath && dropboxToken) {
      try {
        const dropboxVideos = await listDropboxVideos(
          dropboxFolderPath,
          dropboxToken,
          sessionId,
          session.dropboxRefreshToken,
        );

        // Create a map of filename (without extension) -> file path
        // Also create a map with full filename -> file path for exact matches
        dropboxVideos.forEach((file) => {
          const nameWithoutExt = file.name
            .replace(/\.[^/.]+$/, "")
            .toLowerCase();
          const fullName = file.name.toLowerCase();
          const filePath = file.pathLower || file.id;

          // Store both mappings (prefer exact match)
          if (!dropboxFilesMap.has(fullName)) {
            dropboxFilesMap.set(fullName, filePath);
          }
          if (!dropboxFilesMap.has(nameWithoutExt)) {
            dropboxFilesMap.set(nameWithoutExt, filePath);
          }
        });

        console.log(
          `[UPLOAD-SHEETS] Found ${dropboxVideos.length} videos in Dropbox folder, matched ${dropboxFilesMap.size} filename mappings`,
        );
      } catch (error: any) {
        console.error(`[UPLOAD-SHEETS] Error listing Dropbox folder:`, error);
        return NextResponse.json(
          {
            error: `Failed to access Dropbox folder: ${error?.message || "Unknown error"}`,
          },
          { status: 400 },
        );
      }
    } else if (dropboxFolderPath && !dropboxToken) {
      return NextResponse.json(
        {
          error:
            "Dropbox folder specified but Dropbox not authenticated. Please connect Dropbox first.",
        },
        { status: 400 },
      );
    }

    // Helper function to match video_name to Drive file
    const matchDriveFile = (
      videoName: string | undefined,
    ): string | undefined => {
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
      for (const [driveFileName, fileId] of Array.from(
        driveFilesMap.entries(),
      )) {
        if (
          driveFileName.includes(normalizedName) ||
          normalizedName.includes(driveFileName)
        ) {
          return fileId;
        }
      }

      return undefined;
    };

    // Helper function to match video_name to Dropbox file
    const matchDropboxFile = (
      videoName: string | undefined,
    ): string | undefined => {
      if (!videoName || !dropboxFolderPath || dropboxFilesMap.size === 0) {
        return undefined;
      }

      const normalizedName = videoName.toLowerCase().trim();
      const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, "");

      // Try exact match first (with extension)
      if (dropboxFilesMap.has(normalizedName)) {
        return dropboxFilesMap.get(normalizedName);
      }

      // Try match without extension
      if (dropboxFilesMap.has(nameWithoutExt)) {
        return dropboxFilesMap.get(nameWithoutExt);
      }

      // Try partial match (filename contains video_name or vice versa)
      for (const [dropboxFileName, filePath] of Array.from(
        dropboxFilesMap.entries(),
      )) {
        if (
          dropboxFileName.includes(normalizedName) ||
          normalizedName.includes(dropboxFileName)
        ) {
          return filePath;
        }
      }

      return undefined;
    };

    // Convert to queue items and filter invalid ones
    let matchedCount = 0;
    let dropboxMatchedCount = 0;
    let unmatchedCount = 0;
    const unmatchedNames: Array<{
      row: number;
      video_name?: string;
      reason: string;
    }> = [];

    const allQueueItems = normalizedData.map((row, index) => {
      // Match video_name to Drive file if driveFolderId is provided
      let matchedDriveFileId = row.drive_file_id;
      if (driveFolderId && row.video_name && !matchedDriveFileId) {
        matchedDriveFileId = matchDriveFile(row.video_name);
        if (matchedDriveFileId) {
          matchedCount++;
          if (matchedCount <= 5) {
            // Log first 5 matches
            console.log(
              `[UPLOAD-SHEETS] Matched "${row.video_name}" to Drive file ${matchedDriveFileId}`,
            );
          }
        } else {
          unmatchedCount++;
          if (unmatchedCount <= 10) {
            // Log first 10 unmatched
            unmatchedNames.push({
              row: index + 1,
              video_name: row.video_name,
              reason: "No matching Drive file found",
            });
            console.warn(
              `[UPLOAD-SHEETS] Row ${index + 1}: Could not match "${row.video_name}" to any Drive file`,
            );
          }
        }
      }

      // Match video_name to Dropbox file if dropboxFolderPath is provided
      let matchedDropboxFileId: string | undefined = undefined;
      if (
        dropboxFolderPath &&
        row.video_name &&
        !matchedDriveFileId &&
        !row.video_url
      ) {
        matchedDropboxFileId = matchDropboxFile(row.video_name);
        if (matchedDropboxFileId) {
          dropboxMatchedCount++;
          if (dropboxMatchedCount <= 5) {
            // Log first 5 matches
            console.log(
              `[UPLOAD-SHEETS] Matched "${row.video_name}" to Dropbox file ${matchedDropboxFileId}`,
            );
          }
        } else {
          unmatchedCount++;
          if (unmatchedCount <= 10) {
            // Log first 10 unmatched
            unmatchedNames.push({
              row: index + 1,
              video_name: row.video_name,
              reason: "No matching Dropbox file found",
            });
            console.warn(
              `[UPLOAD-SHEETS] Row ${index + 1}: Could not match "${row.video_name}" to any Dropbox file`,
            );
          }
        }
      }

      // Check for missing video sources
      if (
        !row.video_name &&
        !driveFolderId &&
        !dropboxFolderPath &&
        !row.drive_file_id &&
        !row.video_url
      ) {
        unmatchedCount++;
        unmatchedNames.push({
          row: index + 1,
          reason:
            "Missing video_name, drive_file_id, dropbox_file_id, and video_url",
        });
        console.warn(
          `[UPLOAD-SHEETS] Row ${index + 1}: video_name column is empty and no other video source provided`,
        );
      }

      return {
        originalIndex: index + 1, // Keep track of original row number
        title: row.youtube_title || `Video ${index + 1}`,
        description: row.youtube_description || "",
        privacyStatus: (row.privacyStatus || "public") as
          | "public"
          | "private"
          | "unlisted",
        scheduleTime: row.scheduleTime || undefined,
        // Only include publishDate if it's a valid date string
        publishDate: (() => {
          const pubAt = row.publishAt;
          if (!pubAt || typeof pubAt !== "string" || !pubAt.trim())
            return undefined;
          const date = new Date(pubAt);
          if (isNaN(date.getTime())) return undefined; // Invalid date
          return date.toISOString();
        })(),
        videoUrl: row.video_url || undefined,
        thumbnailUrl: row.thumbnail_url || undefined,
        driveFileId: matchedDriveFileId || row.drive_file_id || undefined,
        driveThumbnailId: row.drive_thumbnail_id || undefined,
        dropboxFileId: matchedDropboxFileId || undefined,
        authHeaders: row.url_auth_headers
          ? (() => {
              try {
                return JSON.parse(row.url_auth_headers);
              } catch {
                return undefined;
              }
            })()
          : undefined,
        timeout: row.url_timeout ? parseInt(row.url_timeout, 10) : undefined,
        postUploadAction: row.post_upload_action || "none",
        completedFolderId: row.completed_folder_id || undefined,
        madeForKids: (row as any).made_for_kids ?? false, // Default to false (not made for kids)
      };
    });

    // Filter out invalid items (no video source)
    const validQueueItems = allQueueItems.filter((item, index) => {
      const hasVideoSource =
        item.driveFileId || item.dropboxFileId || item.videoUrl;
      if (!hasVideoSource) {
        unmatchedNames.push({
          row: item.originalIndex,
          video_name: normalizedData[index]?.video_name,
          reason:
            "No video source (missing drive_file_id, dropbox_file_id, video_url, or matched video_name)",
        });
        return false;
      }
      return true;
    });

    const filteredCount = allQueueItems.length - validQueueItems.length;

    // Log summary
    console.log(
      `[UPLOAD-SHEETS] Matching summary: ${matchedCount} Drive matched, ${dropboxMatchedCount} Dropbox matched, ${unmatchedCount} unmatched out of ${normalizedData.length} total rows`,
    );
    console.log(
      `[UPLOAD-SHEETS] Filtered ${filteredCount} invalid items (no video source), ${validQueueItems.length} valid items will be queued`,
    );
    if (unmatchedNames.length > 0) {
      const sampleUnmatched = unmatchedNames.slice(0, 10);
      console.log(
        `[UPLOAD-SHEETS] Sample filtered rows:`,
        sampleUnmatched
          .map(
            (u) =>
              `Row ${u.row}${u.video_name ? ` ("${u.video_name}")` : ""}: ${u.reason}`,
          )
          .join(", "),
      );
    }

    // Use only valid items
    let queueItems = validQueueItems.map(({ originalIndex, ...item }) => item); // Remove originalIndex before queuing

    // Check for duplicates against local uploaded-videos list (no YouTube API)
    let duplicateCount = 0;
    if (queueItems.length > 0) {
      const uploadedSet = getUploadedTitlesSet();
      const before = queueItems.length;
      queueItems = queueItems.filter((item) => {
        const t = (item.title || "").trim();
        const isDuplicate = t && uploadedSet.has(t.toLowerCase());
        if (isDuplicate) {
          console.log(
            `[UPLOAD-SHEETS] Skipping duplicate: "${t.substring(0, 50)}..."`,
          );
        }
        return !isDuplicate;
      });
      duplicateCount = before - queueItems.length;
      if (duplicateCount > 0) {
        console.log(
          `[UPLOAD-SHEETS] Filtered out ${duplicateCount} duplicate(s) from uploaded list`,
        );
      } else {
        console.log(
          `[UPLOAD-SHEETS] No duplicates found, all ${queueItems.length} videos are new`,
        );
      }
    }

    // Check if we have any valid items after duplicate filtering
    if (queueItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid items found to upload",
          totalItems: normalizedData.length,
          filteredItems: filteredCount,
          duplicateCount,
          matchedCount,
          unmatchedCount,
          message: `All ${normalizedData.length} rows were filtered out. ${filteredCount} lacked video sources, ${duplicateCount} were duplicates in uploaded list.`,
        },
        { status: 400 },
      );
    }

    // Add to bulk queue
    // Set startDate to today at noon for consistent scheduling
    const startDateNoon = new Date();
    startDateNoon.setHours(12, 0, 0, 0);

    const jobId = addToBulkQueue({
      sessionId,
      userId,
      type: "urls", // Sheets data is treated like URLs/Drive (streaming)
      videosPerDay: videosPerDay ? parseInt(videosPerDay, 10) : undefined,
      startDate: videosPerDay ? startDateNoon.toISOString() : undefined, // Only set if scheduling
      items: queueItems,
    });

    const warnings: string[] = [];
    if (filteredCount > 0) {
      warnings.push(
        `${filteredCount} row(s) were filtered out due to missing video sources`,
      );
    }
    if (duplicateCount > 0) {
      warnings.push(
        `${duplicateCount} video(s) were skipped (already in uploaded list)`,
      );
    }
    if (warnings.length > 0) {
      warnings.push(
        `Only ${queueItems.length} valid items were queued for upload`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Upload queued for processing",
      jobId,
      totalItems: queueItems.length,
      filteredItems: filteredCount,
      duplicateCount,
      matchedCount,
      dropboxMatchedCount,
      unmatchedCount,
      spreadsheetTitle: metadata.title,
      sheetName: sheetName || metadata.sheets[0]?.title || "Sheet1",
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    console.error("[UPLOAD-SHEETS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error processing Google Sheet" },
      { status: 500 },
    );
  }
}
