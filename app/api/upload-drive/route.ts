import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import {
  listDriveVideosRecursive,
  listDriveVideos,
  getDriveFolderMetadata,
} from "@/lib/drive";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { getUploadedTitlesSet } from "@/lib/uploaded-videos";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/upload-drive
 * Upload videos from a Google Drive folder
 *
 * Body:
 * - driveFolderId: string (required) - Google Drive folder ID
 * - recursive: boolean (optional) - Scan subfolders (default: false)
 * - postUploadAction: "rename" | "delete" | "move" | "none" (optional, default: "none")
 * - completedFolderId: string (optional) - Required if postUploadAction is "move"
 * - privacyStatus: "public" | "private" | "unlisted" (optional, default: "private")
 * - useWorker: boolean (optional, default: true)
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

    // Get userId from session (optional; skip if userinfo scope not granted or token invalid)
    let userId = session.userId;
    if (!userId) {
      try {
        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);
        const oauth2 = google.oauth2({
          version: "v2",
          auth: oAuthClient,
        });
        const userInfo = await oauth2.userinfo.get();
        userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
        if (userId) {
          session.userId = userId;
          setSession(sessionId, session);
        }
      } catch (err) {
        console.warn("[UPLOAD-DRIVE] Could not fetch Google userinfo. Proceeding without userId.", err);
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

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    // Verify folder exists and get metadata (skip for root folder)
    let folderName = "My Drive";
    if (driveFolderId !== "root") {
      try {
        const folderMetadata = await getDriveFolderMetadata(
          driveFolderId,
          oAuthClient,
        );
        folderName = folderMetadata.name;
        console.log(`[UPLOAD-DRIVE] Scanning folder: ${folderName}`);
      } catch (error: any) {
        return NextResponse.json(
          {
            error: `Failed to access Drive folder: ${error?.message || "Unknown error"}`,
          },
          { status: 400 },
        );
      }
    } else {
      console.log(`[UPLOAD-DRIVE] Scanning root folder: My Drive`);
    }

    // List videos in folder
    let videos;
    try {
      // Handle root folder - use 'root' as the folder ID for Drive API
      const targetFolderId = driveFolderId === "root" ? "root" : driveFolderId;

      if (recursive) {
        videos = await listDriveVideosRecursive(targetFolderId, oAuthClient);
      } else {
        videos = await listDriveVideos(targetFolderId, oAuthClient);
      }
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Failed to list videos: ${error?.message || "Unknown error"}`,
        },
        { status: 500 },
      );
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: "No video files found in the specified Drive folder" },
        { status: 400 },
      );
    }

    // If useWorker, queue for background processing
    if (useWorker) {
      let queueItems = videos.map((video) => ({
        driveFileId: video.id,
        title: video.name.replace(/\.[^/.]+$/, ""), // Remove extension
        description: `Uploaded from Google Drive: ${video.name}`,
        privacyStatus: privacyStatus as "public" | "private" | "unlisted",
        postUploadAction,
        completedFolderId,
      }));

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
              `[UPLOAD-DRIVE] Skipping duplicate: "${t.substring(0, 50)}..."`,
            );
          }
          return !isDuplicate;
        });
        duplicateCount = before - queueItems.length;
        if (duplicateCount > 0) {
          console.log(
            `[UPLOAD-DRIVE] Filtered out ${duplicateCount} duplicate(s) from uploaded list`,
          );
        } else {
          console.log(
            `[UPLOAD-DRIVE] No duplicates found, all ${queueItems.length} videos are new`,
          );
        }
      }

      if (queueItems.length === 0) {
        return NextResponse.json(
          {
            error: `All videos were filtered out. ${duplicateCount > 0 ? `${duplicateCount} duplicate(s) in uploaded list. ` : ""}No new videos to upload.`,
            totalVideos: videos.length,
            duplicateCount,
          },
          { status: 400 },
        );
      }

      const jobId = addToBulkQueue({
        sessionId,
        userId,
        type: "urls", // Drive files are treated like URLs (streaming)
        items: queueItems,
      });

      return NextResponse.json({
        success: true,
        message: `Upload queued for processing${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped)` : ""}`,
        jobId,
        totalItems: queueItems.length,
        duplicateCount,
        folderName: folderName,
      });
    }

    // Otherwise, return list of videos (for future synchronous processing)
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
  } catch (error: any) {
    console.error("[UPLOAD-DRIVE] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error processing Drive folder" },
      { status: 500 },
    );
  }
}
