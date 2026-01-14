import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession, setSession, generateSessionId } from "@/lib/session";
import { cookies } from "next/headers";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Get the correct base URL (handles proxy/forwarded headers)
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "zondiscounts.com";
  const protocol =
    request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");
  const baseUrl = `${protocol}://${host}`;

  if (!code) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  try {
    const oAuthClient = getOAuthClient();
    const { tokens } = await oAuthClient.getToken(code);

    oAuthClient.setCredentials(tokens);

    // Get user info to store userId
    const oauth2 = google.oauth2({
      version: "v2",
      auth: oAuthClient,
    });
    const userInfo = await oauth2.userinfo.get();
    const userId = userInfo.data.email || userInfo.data.id || undefined;

    // Get or create session
    const cookieStore = await cookies();
    let sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      sessionId = generateSessionId();
      cookieStore.set("sessionId", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    setSession(sessionId, {
      authenticated: true,
      userId: userId,
      tokens: tokens as {
        access_token?: string | null;
        refresh_token?: string | null;
        [key: string]: any;
      },
    });

    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
