import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { listStagingFiles, listAllStagingFilesForEmail } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * List all files in staging area
 */
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
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if a specific channel is requested
    const { searchParams } = new URL(request.url);
    const requestedChannel = searchParams.get("channel");

    let targetUserId: string | undefined;
    let targetSessionId: string | undefined;

    if (requestedChannel) {
      // Use the requested channel's userId directly
      targetUserId = requestedChannel;
      // Don't use sessionId for channel-specific requests
    } else {
      // Default behavior: use current session's userId
      targetUserId = session.userId;
      targetSessionId = sessionId;
      
      // Get userId (email) from session (or fetch if not stored)
      if (!targetUserId) {
        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);
        const oauth2 = google.oauth2({
          version: "v2",
          auth: oAuthClient,
        });
        const userInfo = await oauth2.userinfo.get();
        targetUserId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
        // Update session with userId for future use
        if (targetUserId) {
          session.userId = targetUserId;
          setSession(sessionId, session);
        }
      }
    }

    // List staging files for the specific channel
    const stagingFiles = listStagingFiles(targetUserId, targetSessionId);

    // Calculate totals
    const totalVideos = stagingFiles.videos.length;
    const totalThumbnails = stagingFiles.thumbnails.length;
    const totalVideoSize = stagingFiles.videos.reduce((sum, v) => sum + v.size, 0);
    const totalThumbnailSize = stagingFiles.thumbnails.reduce((sum, t) => sum + t.size, 0);

    return NextResponse.json({
      success: true,
      videos: stagingFiles.videos.map(v => ({
        ...v,
        sizeFormatted: `${(v.size / 1024 / 1024).toFixed(2)} MB`,
      })),
      thumbnails: stagingFiles.thumbnails.map(t => ({
        ...t,
        sizeFormatted: `${(t.size / 1024).toFixed(2)} KB`,
      })),
      totals: {
        videoCount: totalVideos,
        thumbnailCount: totalThumbnails,
        totalVideoSize,
        totalVideoSizeFormatted: `${(totalVideoSize / 1024 / 1024).toFixed(2)} MB`,
        totalThumbnailSize,
        totalThumbnailSizeFormatted: `${(totalThumbnailSize / 1024).toFixed(2)} KB`,
      },
    });
  } catch (error: any) {
    console.error("List staging files error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list staging files" },
      { status: 500 }
    );
  }
}



