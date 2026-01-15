import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getOAuthClient, CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from "@/lib/auth";
import { setSession, generateSessionId } from "@/lib/session";
import { cookies } from "next/headers";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Get the correct base URL (handles proxy/forwarded headers)
  // x-forwarded-host can contain multiple comma-separated values, take the first one
  const rawHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "zondiscounts.com";
  const host = rawHost.split(",")[0].trim();
  
  const rawProtocol =
    request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");
  const protocol = rawProtocol.split(",")[0].trim();
  
  const baseUrl = `${protocol}://${host}`;
  console.log(`[AUTH CALLBACK] Base URL: ${baseUrl}`);

  // Check for OAuth error from Google
  if (error) {
    console.error(`[AUTH CALLBACK] Google OAuth error: ${error}`);
    return NextResponse.redirect(new URL(`/?error=oauth_${error}`, baseUrl));
  }

  if (!code) {
    console.error("[AUTH CALLBACK] No authorization code received");
    return NextResponse.redirect(new URL("/?error=no_code", baseUrl));
  }

  // Check if OAuth credentials are configured
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
    console.error("[AUTH CALLBACK] OAuth credentials not configured");
    return NextResponse.redirect(new URL("/?error=oauth_not_configured", baseUrl));
  }

  console.log(`[AUTH CALLBACK] Processing callback, code length: ${code.length}`);

  try {
    // Step 1: Exchange code for tokens
    let tokens;
    try {
      const oAuthClient = getOAuthClient();
      const tokenResponse = await oAuthClient.getToken(code);
      tokens = tokenResponse.tokens;
      console.log(`[AUTH CALLBACK] Token exchange successful, has refresh_token: ${!!tokens.refresh_token}`);
    } catch (tokenError: any) {
      console.error("[AUTH CALLBACK] Token exchange failed:", tokenError?.message || tokenError);
      return NextResponse.redirect(new URL(`/?error=token_exchange_failed`, baseUrl));
    }

    // Step 2: Get user info
    let userId: string | undefined;
    try {
      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(tokens);
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
      console.log(`[AUTH CALLBACK] User info retrieved: ${userId?.substring(0, 10)}...`);
    } catch (userInfoError: any) {
      console.error("[AUTH CALLBACK] Failed to get user info:", userInfoError?.message || userInfoError);
      // Continue without userId - not critical
    }

    // Step 3: Create or update session
    let sessionId: string;
    try {
      const cookieStore = await cookies();
      sessionId = cookieStore.get("sessionId")?.value || generateSessionId();

      if (!cookieStore.get("sessionId")?.value) {
        cookieStore.set("sessionId", sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }
      console.log(`[AUTH CALLBACK] Session ID: ${sessionId.substring(0, 10)}...`);
    } catch (cookieError: any) {
      console.error("[AUTH CALLBACK] Cookie error:", cookieError?.message || cookieError);
      return NextResponse.redirect(new URL("/?error=cookie_failed", baseUrl));
    }

    // Step 4: Save session data
    try {
      setSession(sessionId, {
        authenticated: true,
        userId: userId,
        tokens: tokens as {
          access_token?: string | null;
          refresh_token?: string | null;
          [key: string]: any;
        },
      });
      console.log("[AUTH CALLBACK] Session saved successfully");
    } catch (sessionError: any) {
      console.error("[AUTH CALLBACK] Session save error:", sessionError?.message || sessionError);
      return NextResponse.redirect(new URL("/?error=session_failed", baseUrl));
    }

    console.log("[AUTH CALLBACK] Authentication complete, redirecting to dashboard");
    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  } catch (error: any) {
    console.error("[AUTH CALLBACK] Unexpected error:", error?.message || error);
    console.error("[AUTH CALLBACK] Stack:", error?.stack);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
