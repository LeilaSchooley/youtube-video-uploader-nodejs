import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { saveToStaging } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large file uploads
export const runtime = 'nodejs';

/**
 * Upload individual video or thumbnail files to staging area
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

    // Get userId from session (or fetch if not stored)
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null; // "video" or "thumbnail"
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Determine file type from file or parameter
    let type: "video" | "thumbnail" = "video";
    if (fileType === "thumbnail") {
      type = "thumbnail";
    } else if (file.type.startsWith("video/")) {
      type = "video";
    } else if (file.type.startsWith("image/") || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      type = "thumbnail";
    }

    // Validate file type
    if (type === "video" && !file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "File must be a video (MP4, etc.)" },
        { status: 400 }
      );
    }

    if (type === "thumbnail" && !file.type.startsWith("image/") && !file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return NextResponse.json(
        { error: "File must be an image (JPG, PNG, etc.)" },
        { status: 400 }
      );
    }

    // Save to staging
    const savedFile = await saveToStaging(file, userId, sessionId, type);

    return NextResponse.json({
      success: true,
      file: {
        fileName: savedFile.fileName,
        size: savedFile.size,
        sizeFormatted: type === "video" 
          ? `${(savedFile.size / 1024 / 1024).toFixed(2)} MB`
          : `${(savedFile.size / 1024).toFixed(2)} KB`,
        type,
      },
    });
  } catch (error: any) {
    console.error("Staging upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}

