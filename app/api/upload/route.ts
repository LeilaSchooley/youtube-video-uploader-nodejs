import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { getDriveOAuthClientForSession } from "@/lib/auth-drive";
import { getSession } from "@/lib/session";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import { downloadDriveFile, isDriveFileId } from "@/lib/drive";
import { downloadDropboxFile } from "@/lib/dropbox";
import { isDropboxPath } from "@/lib/dropbox";
import {
  sanitizeYoutubeTitle,
  sanitizeYoutubeDescription,
} from "@/lib/youtube-utils";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large video uploads
export const runtime = 'nodejs';

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

    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const privacyStatus = (formData.get("privacyStatus") as string) || "public";
    const publishDate = formData.get("publishDate") as string | null;
    const videoFile = formData.get("video") as File | null;
    const driveFileId = (formData.get("driveFileId") as string | null)?.trim() || "";
    const dropboxFilePath =
      (formData.get("dropboxFilePath") as string | null)?.trim() || "";

    let videoStream: Readable;
    if (driveFileId && isDriveFileId(driveFileId)) {
      const driveClient = await getDriveOAuthClientForSession(sessionId);
      if (!driveClient) {
        return NextResponse.json(
          { error: "Google Drive not connected" },
          { status: 401 },
        );
      }
      videoStream = await downloadDriveFile(driveFileId, driveClient);
    } else if (dropboxFilePath && isDropboxPath(dropboxFilePath)) {
      const dropboxToken = await getDropboxToken(
        session.dropboxToken,
        session.dropboxRefreshToken,
        sessionId,
      );
      if (!dropboxToken) {
        return NextResponse.json(
          { error: "Dropbox not connected" },
          { status: 401 },
        );
      }
      videoStream = await downloadDropboxFile(
        dropboxFilePath,
        dropboxToken,
        sessionId,
        session.dropboxRefreshToken ?? null,
      );
    } else if (videoFile && videoFile.size > 0) {
      const bytes = await videoFile.arrayBuffer();
      videoStream = Readable.from(Buffer.from(bytes));
    } else {
      return NextResponse.json(
        { error: "Choose a video from this device, Dropbox, or Google Drive" },
        { status: 400 },
      );
    }

    // Validate privacy status
    if (!["public", "private", "unlisted"].includes(privacyStatus)) {
      return NextResponse.json(
        { error: "Invalid privacy status" },
        { status: 400 }
      );
    }

    // Validate publish date if private
    if (privacyStatus === "private" && publishDate) {
      const publishDateObj = new Date(publishDate);
      if (publishDateObj < new Date()) {
        return NextResponse.json(
          { error: "Publish date must be in the future" },
          { status: 400 }
        );
      }
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const requestBody: {
      snippet: { title: string; description: string };
      status: { 
        privacyStatus: string; 
        publishAt?: string;
        selfDeclaredMadeForKids?: boolean;
      };
    } = {
      snippet: {
        title: sanitizeYoutubeTitle(title),
        description: sanitizeYoutubeDescription(description),
      },
      status: { 
        privacyStatus,
        selfDeclaredMadeForKids: false, // Default to false (not made for kids)
      },
    };

    if (privacyStatus === "private" && publishDate) {
      requestBody.status.publishAt = new Date(publishDate).toISOString();
    }

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    const result = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody,
      media: {
        body: videoStream,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Video uploaded successfully",
      videoId: result.data.id,
    });
  } catch (error: any) {
    console.error("=== VIDEO UPLOAD ERROR ===");
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error("Error status:", error?.status);
    console.error("Error response:", error?.response?.data);
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("Stack trace:", error?.stack);
    console.error("==========================");
    
    // Return more detailed error information
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        "Error while uploading video";
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

