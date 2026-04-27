import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { postTopLevelComment, formatCommentPostError } from "@/lib/youtube-comments";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/test-comment
 * Test posting a comment to a YouTube video without uploading.
 * Body: { videoId: string, commentText: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { videoId, commentText } = await request.json() as {
      videoId?: string;
      commentText?: string;
    };

    if (!videoId || !commentText) {
      return NextResponse.json(
        { error: "Missing videoId or commentText" },
        { status: 400 },
      );
    }

    if (commentText.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment text cannot be empty" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated. Please login first." },
        { status: 401 },
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json(
        { error: "Session invalid or expired. Please login again." },
        { status: 401 },
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    try {
      const result = await postTopLevelComment(youtube, videoId, commentText);
      return NextResponse.json({
        success: true,
        commentId: result.commentId,
        message: "Comment posted successfully!",
      });
    } catch (error: unknown) {
      const errorMsg = formatCommentPostError(error);
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          message: "Failed to post comment. Check permissions and re-authenticate if needed.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
