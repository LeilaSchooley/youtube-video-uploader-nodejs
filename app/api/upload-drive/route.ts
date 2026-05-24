import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { requireDriveOAuthClient } from "@/lib/drive-api-auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import {
  listDriveVideosRecursive,
  listDriveVideos,
  getDriveFolderMetadata,
  downloadDriveFileToBuffer,
  listDriveImagesInFolder,
  getDriveFileMetadata,
} from "@/lib/drive";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { getUploadedTitlesSet } from "@/lib/uploaded-videos";
import { jsonApiError } from "@/lib/api-response";
import { parseSpreadsheetBuffer } from "@/lib/spreadsheet-buffer-parse";
import { buildDriveBulkQueueItems } from "@/lib/drive-bulk-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/upload-drive
 * Queue uploads from a Google Drive folder (Dropbox-parity options).
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

    let userId = session.userId;
    if (!userId) {
      try {
        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);
        const oauth2 = google.oauth2({ version: "v2", auth: oAuthClient });
        const userInfo = await oauth2.userinfo.get();
        userId = (userInfo.data.email || userInfo.data.id || undefined) as
          | string
          | undefined;
        if (userId) {
          session.userId = userId;
          setSession(sessionId, session);
        }
      } catch {
        console.warn("[UPLOAD-DRIVE] Could not fetch Google userinfo.");
      }
    }

    const body = await request.json();
    const {
      driveFolderId,
      recursive = false,
      postUploadAction = "none",
      completedFolderId,
      privacyStatus = "public",
      useWorker = true,
      driveCsvFileId,
      driveCsvFileName,
      driveSheetName,
      driveThumbnailsFolderId,
      videosPerDay,
      skipDuplicateTitles = true,
    } = body;

    if (!driveFolderId) {
      return NextResponse.json(
        { error: "driveFolderId is required" },
        { status: 400 },
      );
    }

    if (postUploadAction === "move" && !completedFolderId) {
      return NextResponse.json(
        {
          error:
            "completedFolderId is required when postUploadAction is 'move'",
        },
        { status: 400 },
      );
    }

    const driveAuth = await requireDriveOAuthClient(sessionId);
    if ("response" in driveAuth) {
      return driveAuth.response;
    }
    const driveOAuthClient = driveAuth.client;

    let folderName = "My Drive";
    if (driveFolderId !== "root") {
      try {
        const folderMetadata = await getDriveFolderMetadata(
          driveFolderId,
          driveOAuthClient,
        );
        folderName = folderMetadata.name;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
          { error: `Failed to access Drive folder: ${msg}` },
          { status: 400 },
        );
      }
    }

    const targetFolderId = driveFolderId === "root" ? "root" : driveFolderId;
    let videos;
    try {
      videos = recursive
        ? await listDriveVideosRecursive(targetFolderId, driveOAuthClient)
        : await listDriveVideos(targetFolderId, driveOAuthClient);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: `Failed to list videos: ${msg}` },
        { status: 500 },
      );
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: "No video files found in the specified Drive folder" },
        { status: 400 },
      );
    }

    let csvRows: Awaited<ReturnType<typeof parseSpreadsheetBuffer>>["rows"] =
      [];
    let videoNameColumn: string | null = null;

    if (driveCsvFileId?.trim()) {
      try {
        const meta = driveCsvFileName?.trim()
          ? { name: driveCsvFileName.trim() }
          : await getDriveFileMetadata(driveCsvFileId.trim(), driveOAuthClient);
        const buffer = await downloadDriveFileToBuffer(
          driveCsvFileId.trim(),
          driveOAuthClient,
        );
        const parsed = await parseSpreadsheetBuffer(
          buffer,
          meta.name,
          driveSheetName?.trim() || undefined,
        );
        csvRows = parsed.rows;
        videoNameColumn = parsed.videoNameColumn;
        console.log(
          `[UPLOAD-DRIVE] Parsed ${csvRows.length} metadata rows from ${meta.name}`,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
          { error: `Failed to parse metadata file: ${msg}` },
          { status: 400 },
        );
      }
    }

    const thumbnailsMap = new Map<string, string>();
    if (driveThumbnailsFolderId?.trim()) {
      try {
        const thumbId =
          driveThumbnailsFolderId.trim() === "root"
            ? "root"
            : driveThumbnailsFolderId.trim();
        const images = await listDriveImagesInFolder(
          thumbId,
          driveOAuthClient,
        );
        for (const img of images) {
          const nameWoExt = img.name
            .toLowerCase()
            .replace(/\.[^/.]+$/, "");
          thumbnailsMap.set(nameWoExt, img.id);
        }
        console.log(
          `[UPLOAD-DRIVE] Thumbnails folder: ${thumbnailsMap.size} image(s)`,
        );
      } catch (thumbErr: unknown) {
        const msg =
          thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
        console.warn(`[UPLOAD-DRIVE] Thumbnails folder failed: ${msg}`);
      }
    }

    if (!useWorker) {
      return NextResponse.json({
        success: true,
        videos: videos.map((v) => ({
          id: v.id,
          name: v.name,
          size: v.size,
          webViewLink: v.webViewLink,
        })),
        total: videos.length,
      });
    }

    const built = buildDriveBulkQueueItems({
      videos,
      csvRows,
      videoNameColumn,
      thumbnailsMap,
      privacyStatus: privacyStatus as "public" | "private" | "unlisted",
      postUploadAction,
      completedFolderId,
    });

    if (!built.ok) {
      return NextResponse.json(
        { error: built.error, ...built.details },
        { status: built.status },
      );
    }

    let queueItems = built.queueItems;
    let duplicateCount = 0;

    if (skipDuplicateTitles && queueItems.length > 0) {
      const uploadedSet = getUploadedTitlesSet();
      const before = queueItems.length;
      queueItems = queueItems.filter((item) => {
        const t = (item.title || "").trim();
        return !(t && uploadedSet.has(t.toLowerCase()));
      });
      duplicateCount = before - queueItems.length;
    }

    if (queueItems.length === 0) {
      return NextResponse.json(
        {
          error: `All videos were filtered out.${duplicateCount > 0 ? ` ${duplicateCount} duplicate(s).` : ""}`,
          totalVideos: videos.length,
          duplicateCount,
        },
        { status: 400 },
      );
    }

    const scheduleVpd =
      videosPerDay !== undefined && videosPerDay !== null
        ? parseInt(String(videosPerDay), 10)
        : undefined;

    const jobId = addToBulkQueue({
      sessionId,
      userId,
      type: "urls",
      items: queueItems,
      ...(scheduleVpd && scheduleVpd > 0 ? { videosPerDay: scheduleVpd } : {}),
    });

    return NextResponse.json({
      success: true,
      message: `Upload queued for processing${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped)` : ""}`,
      jobId,
      totalItems: queueItems.length,
      duplicateCount,
      folderName,
      matchedCount: built.matchedCount,
      unmatchedCount: built.unmatchedCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[UPLOAD-DRIVE] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
