import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { saveToStaging } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large file uploads
export const runtime = "nodejs";

/**
 * Upload individual video or thumbnail files to staging area
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
      userId = (userInfo.data.email || userInfo.data.id || undefined) as
        | string
        | undefined;
      session.userId = userId;
      setSession(sessionId, session);
    }

    const formData = await request.formData();
    const fileType = formData.get("type") as string | null; // "video" or "thumbnail"

    // Get all files (support both "file" and "files" for backward compatibility)
    const files: File[] = [];
    const singleFile = formData.get("file") as File | null;
    if (singleFile) {
      files.push(singleFile);
    }
    const multipleFiles = formData.getAll("files") as File[];
    if (multipleFiles.length > 0) {
      files.push(...multipleFiles);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadedFiles: Array<{
      fileName: string;
      size: number;
      sizeFormatted: string;
      type: "video" | "thumbnail";
    }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    // Process each file
    for (const file of files) {
      try {
        // Determine file type from file or parameter
        let type: "video" | "thumbnail" = "video";
        if (fileType === "thumbnail") {
          type = "thumbnail";
        } else if (file.type.startsWith("video/")) {
          type = "video";
        } else if (
          file.type.startsWith("image/") ||
          file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          type = "thumbnail";
        }

        // Validate file type
        if (type === "video" && !file.type.startsWith("video/")) {
          errors.push({
            fileName: file.name,
            error: "File must be a video (MP4, etc.)",
          });
          continue;
        }

        if (
          type === "thumbnail" &&
          !file.type.startsWith("image/") &&
          !file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          errors.push({
            fileName: file.name,
            error: "File must be an image (JPG, PNG, etc.)",
          });
          continue;
        }

        // Save to staging
        const savedFile = await saveToStaging(file, userId, sessionId, type);

        uploadedFiles.push({
          fileName: savedFile.fileName,
          size: savedFile.size,
          sizeFormatted:
            type === "video"
              ? `${(savedFile.size / 1024 / 1024).toFixed(2)} MB`
              : `${(savedFile.size / 1024).toFixed(2)} KB`,
          type,
        });
      } catch (error: any) {
        errors.push({
          fileName: file.name,
          error: error?.message || "Failed to upload file",
        });
      }
    }

    return NextResponse.json({
      success: uploadedFiles.length > 0,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
      message:
        uploadedFiles.length > 0
          ? `Successfully uploaded ${uploadedFiles.length} file(s)${
              errors.length > 0 ? `, ${errors.length} failed` : ""
            }`
          : `Failed to upload ${errors.length} file(s)`,
    });
  } catch (error: any) {
    console.error("Staging upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
