import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/youtube/channels
 * Lists YouTube channels the signed-in user can manage (OAuth).
 */
export async function GET() {
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

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);
    const yt = google.youtube({ version: "v3", auth: oAuthClient });
    const res = await yt.channels.list({
      part: ["id", "snippet"],
      mine: true,
      maxResults: 50,
    });
    const channels = (res.data.items || []).map((c) => ({
      id: c.id as string,
      title: c.snippet?.title || c.id,
    }));

    return NextResponse.json({ success: true, channels });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[YOUTUBE-CHANNELS]", message);
    return NextResponse.json(
      { success: false, error: message, channels: [] },
      { status: 500 },
    );
  }
}
