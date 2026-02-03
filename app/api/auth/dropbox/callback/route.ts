import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { exchangeDropboxCode } from "@/lib/auth";
import { getSession, setSession, generateSessionId } from "@/lib/session";
import { setDropboxTokensForUser } from "@/lib/dropbox-by-user";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Get the correct base URL
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

  // Check for OAuth error from Dropbox
  if (error) {
    console.error(`[DROPBOX AUTH CALLBACK] Dropbox OAuth error: ${error}`);
    return NextResponse.redirect(
      new URL(`/?error=dropbox_oauth_${error}`, baseUrl),
    );
  }

  if (!code) {
    console.error("[DROPBOX AUTH CALLBACK] No authorization code received");
    return NextResponse.redirect(new URL("/?error=dropbox_no_code", baseUrl));
  }

  console.log(
    `[DROPBOX AUTH CALLBACK] Processing callback, code length: ${code.length}`,
  );

  try {
    // Step 1: Exchange code for tokens
    let dropboxToken: string;
    let dropboxRefreshToken: string | undefined;
    try {
      const tokenData = await exchangeDropboxCode(code);
      dropboxToken = tokenData.access_token;
      dropboxRefreshToken = tokenData.refresh_token;
      console.log(
        `[DROPBOX AUTH CALLBACK] Token exchange successful, has refresh_token: ${!!dropboxRefreshToken}`,
      );
    } catch (tokenError: any) {
      console.error(
        "[DROPBOX AUTH CALLBACK] Token exchange failed:",
        tokenError?.message || tokenError,
      );
      return NextResponse.redirect(
        new URL(`/?error=dropbox_token_exchange_failed`, baseUrl),
      );
    }

    // Step 2: Get or create session
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
      console.log(
        `[DROPBOX AUTH CALLBACK] Session ID: ${sessionId.substring(0, 10)}...`,
      );
    } catch (cookieError: any) {
      console.error(
        "[DROPBOX AUTH CALLBACK] Cookie error:",
        cookieError?.message || cookieError,
      );
      return NextResponse.redirect(
        new URL("/?error=dropbox_cookie_failed", baseUrl),
      );
    }

    // Step 3: Update session with Dropbox token and refresh token
    try {
      const existingSession = getSession(sessionId);
      setSession(sessionId, {
        ...existingSession,
        authenticated: existingSession?.authenticated || false, // Keep Google auth status
        dropboxToken: dropboxToken,
        dropboxRefreshToken: dropboxRefreshToken, // Store refresh token for automatic renewal
      });
      // Persist by userId so Dropbox survives logout/login (same Google account)
      if (existingSession?.userId) {
        setDropboxTokensForUser(existingSession.userId, {
          dropboxToken,
          dropboxRefreshToken,
        });
      }
      console.log(
        "[DROPBOX AUTH CALLBACK] Dropbox token and refresh token saved to session",
      );
    } catch (sessionError: any) {
      console.error(
        "[DROPBOX AUTH CALLBACK] Session save error:",
        sessionError?.message || sessionError,
      );
      return NextResponse.redirect(
        new URL("/?error=dropbox_session_failed", baseUrl),
      );
    }

    console.log(
      "[DROPBOX AUTH CALLBACK] Dropbox authentication complete, redirecting to dashboard",
    );
    return NextResponse.redirect(
      new URL("/dashboard?dropbox_connected=1", baseUrl),
    );
  } catch (error: any) {
    console.error(
      "[DROPBOX AUTH CALLBACK] Unexpected error:",
      error?.message || error,
    );
    return NextResponse.redirect(
      new URL("/?error=dropbox_auth_failed", baseUrl),
    );
  }
}
