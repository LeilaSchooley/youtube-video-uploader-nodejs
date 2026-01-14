import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";

export const dynamic = 'force-dynamic';

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
    const privacyStatus = formData.get("privacyStatus") as string;
    const publishDate = formData.get("publishDate") as string | null;
    const videoFile = formData.get("video") as File | null;

    if (!videoFile) {
      return NextResponse.json(
        { error: "No video uploaded" },
        { status: 400 }
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
      status: { privacyStatus: string; publishAt?: string };
    } = {
      snippet: { title, description },
      status: { privacyStatus },
    };

    if (privacyStatus === "private" && publishDate) {
      requestBody.status.publishAt = new Date(publishDate).toISOString();
    }

    // Convert File to stream
    const bytes = await videoFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const videoStream = Readable.from(buffer);

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
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Error while uploading video" },
      { status: 500 }
    );
  }
}

