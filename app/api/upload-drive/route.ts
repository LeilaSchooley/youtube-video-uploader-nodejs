import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { listDriveVideosRecursive, listDriveVideos, downloadDriveFile, renameDriveFile, moveDriveFile, deleteDriveFile, getDriveFileMetadata, getDriveFolderMetadata } from "@/lib/drive";
import { addToBulkQueue } from "@/lib/bulk-queue";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

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

    // Get userId from session
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
      session.userId = userId;
      setSession(sessionId, session);
    }

    const body = await request.json();
    const {
      driveFolderId,
      recursive = false,
      postUploadAction = "none",
      completedFolderId,
      privacyStatus = "private",
      useWorker = true,
    } = body;

    if (!driveFolderId) {
      return NextResponse.json(
        { error: "driveFolderId is required" },
        { status: 400 }
      );
    }

    if (postUploadAction === "move" && !completedFolderId) {
      return NextResponse.json(
        { error: "completedFolderId is required when postUploadAction is 'move'" },
        { status: 400 }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    // Verify folder exists and get metadata
    try {
      const folderMetadata = await getDriveFolderMetadata(driveFolderId, oAuthClient);
      console.log(`[UPLOAD-DRIVE] Scanning folder: ${folderMetadata.name}`);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to access Drive folder: ${error?.message || "Unknown error"}` },
        { status: 400 }
      );
    }

    // List videos in folder
    let videos;
    try {
      if (recursive) {
        videos = await listDriveVideosRecursive(driveFolderId, oAuthClient);
      } else {
        videos = await listDriveVideos(driveFolderId, oAuthClient);
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to list videos: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: "No video files found in the specified Drive folder" },
        { status: 400 }
      );
    }

    // If useWorker, queue for background processing
    if (useWorker) {
      const queueItems = videos.map((video) => ({
        driveFileId: video.id,
        title: video.name.replace(/\.[^/.]+$/, ""), // Remove extension
        description: `Uploaded from Google Drive: ${video.name}`,
        privacyStatus: privacyStatus as "public" | "private" | "unlisted",
        postUploadAction,
        completedFolderId,
      }));

      const jobId = addToBulkQueue({
        sessionId,
        userId,
        type: "urls", // Drive files are treated like URLs (streaming)
        items: queueItems,
      });

      return NextResponse.json({
        success: true,
        message: "Upload queued for processing",
        jobId,
        totalItems: queueItems.length,
        folderName: (await getDriveFolderMetadata(driveFolderId, oAuthClient)).name,
      });
    }

    // Otherwise, return list of videos (for future synchronous processing)
    return NextResponse.json({
      success: true,
      videos: videos.map(v => ({
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
      { status: 500 }
    );
  }
}
