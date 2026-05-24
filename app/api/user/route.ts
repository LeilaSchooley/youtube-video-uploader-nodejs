import { NextResponse } from "next/server";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { sessionHasDriveTokens } from "@/lib/auth-drive";
import { getSession } from "@/lib/session";
import { google } from "googleapis";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: oAuthClient,
    });

    let name: string | null = null;
    let picture: string | null = null;
    try {
      const response = await oauth2.userinfo.get();
      name = response.data.name ?? null;
      picture = response.data.picture ?? null;
    } catch {
      // When Google scopes are minimal (DISABLE_GOOGLE_SCOPES), userinfo is not available
    }

    try {
      const youtube = google.youtube({
        version: "v3",
        auth: oAuthClient,
      });
      const channelRes = await youtube.channels.list({
        part: ["snippet"],
        mine: true,
        maxResults: 1,
      });
      const snippet = channelRes.data.items?.[0]?.snippet;
      const channelTitle = snippet?.title?.trim() || null;
      const channelPicture =
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.medium?.url ||
        snippet?.thumbnails?.default?.url ||
        null;

      if (channelTitle) {
        name = channelTitle;
      }
      if (channelPicture) {
        picture = channelPicture;
      }
    } catch {
      // Ignore channel metadata failures and keep existing userinfo values
    }

    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
    );

    return NextResponse.json({
      authenticated: true,
      name: name ?? session.userId ?? "Account",
      picture: picture ?? "",
      hasDropbox: !!dropboxToken,
      hasGoogleDrive: sessionHasDriveTokens(sessionId),
    });
  } catch (error: any) {
    console.error("User info error:", error);
    return NextResponse.json(
      { authenticated: false, error: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
