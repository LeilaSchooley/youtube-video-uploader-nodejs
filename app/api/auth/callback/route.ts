import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import {
  getOAuthClient,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL,
} from "@/lib/auth";
import { getSession, setSession, generateSessionId } from "@/lib/session";
import {
  getDropboxTokensForCandidates,
  setDropboxTokensForUser,
} from "@/lib/dropbox-by-user";
import {
  getDriveTokensForCandidates,
  setDriveTokensForUser,
} from "@/lib/drive-by-user";
import { cookies } from "next/headers";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

/** Google may expose email, numeric id, or OIDC sub; Dropbox store may use any of them as key. */
function googleIdentityCandidates(
  userId: string | undefined,
  tokens: { id_token?: string | null },
): string[] {
  const out: string[] = [];
  if (userId?.trim()) out.push(userId.trim());
  const idt = tokens.id_token;
  if (idt) {
    try {
      const payload = JSON.parse(
        Buffer.from(idt.split(".")[1], "base64url").toString(),
      ) as { sub?: string; email?: string };
      if (payload.sub?.trim()) out.push(payload.sub.trim());
      if (payload.email?.trim()) out.push(payload.email.trim());
    } catch {
      // ignore invalid JWT segment
    }
  }
  return Array.from(new Set(out));
}

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
    return NextResponse.redirect(
      new URL("/?error=oauth_not_configured", baseUrl),
    );
  }

  console.log(
    `[AUTH CALLBACK] Processing callback, code length: ${code.length}`,
  );

  try {
    // Step 1: Exchange code for tokens
    let tokens;
    try {
      const oAuthClient = getOAuthClient();
      const tokenResponse = await oAuthClient.getToken(code);
      tokens = tokenResponse.tokens;
      console.log(
        `[AUTH CALLBACK] Token exchange successful, has refresh_token: ${!!tokens.refresh_token}`,
      );
    } catch (tokenError: any) {
      console.error(
        "[AUTH CALLBACK] Token exchange failed:",
        tokenError?.message || tokenError,
      );
      return NextResponse.redirect(
        new URL(`/?error=token_exchange_failed`, baseUrl),
      );
    }

    // Step 2: Get user info (or from id_token when minimal scopes / userinfo disabled)
    let userId: string | undefined;
    try {
      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(tokens);
      const oauth2 = google.oauth2({
        version: "v2",
        auth: oAuthClient,
      });
      const userInfo = await oauth2.userinfo.get();
      userId = (userInfo.data.email || userInfo.data.id || undefined) as
        | string
        | undefined;
      console.log(
        `[AUTH CALLBACK] User info retrieved: ${userId?.substring(0, 10)}...`,
      );
    } catch (userInfoError: any) {
      // When DISABLE_GOOGLE_SCOPES / minimal scopes, userinfo scope is not requested; use id_token sub
      const idToken = (tokens as { id_token?: string }).id_token;
      if (idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(idToken.split(".")[1], "base64url").toString(),
          );
          userId = payload.sub || payload.email || undefined;
          if (userId) {
            console.log(
              `[AUTH CALLBACK] User ID from id_token: ${userId.substring(0, 10)}...`,
            );
          }
        } catch {
          // ignore decode errors
        }
      }
      if (!userId) {
        console.error(
          "[AUTH CALLBACK] Failed to get user info:",
          userInfoError?.message || userInfoError,
        );
      }
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
      console.log(
        `[AUTH CALLBACK] Session ID: ${sessionId.substring(0, 10)}...`,
      );
    } catch (cookieError: any) {
      console.error(
        "[AUTH CALLBACK] Cookie error:",
        cookieError?.message || cookieError,
      );
      return NextResponse.redirect(new URL("/?error=cookie_failed", baseUrl));
    }

    // Step 4: Save session data and merge Dropbox tokens (file + any already on this session)
    try {
      const existingSession = getSession(sessionId);
      const dropboxFromFile = getDropboxTokensForCandidates(
        googleIdentityCandidates(userId, tokens as { id_token?: string }),
      );
      const dropboxFromSession =
        existingSession?.dropboxToken || existingSession?.dropboxRefreshToken
          ? {
              dropboxToken: existingSession.dropboxToken as string,
              dropboxRefreshToken: existingSession.dropboxRefreshToken,
            }
          : undefined;
      // Prefer durable per-user store; else keep Dropbox from session (e.g. user connected Dropbox before userId existed)
      const dropboxMerged = dropboxFromFile ?? dropboxFromSession;

      const driveFromFile = getDriveTokensForCandidates(
        googleIdentityCandidates(userId, tokens),
      );
      const driveFromSession = existingSession?.driveTokens;
      const driveMerged =
        driveFromFile ??
        (driveFromSession?.access_token || driveFromSession?.refresh_token
          ? driveFromSession
          : undefined);

      setSession(sessionId, {
        authenticated: true,
        userId: userId,
        tokens: tokens as {
          access_token?: string | null;
          refresh_token?: string | null;
          [key: string]: any;
        },
        ...(dropboxMerged && {
          dropboxToken: dropboxMerged.dropboxToken,
          dropboxRefreshToken: dropboxMerged.dropboxRefreshToken,
        }),
        ...(driveMerged && { driveTokens: driveMerged }),
      });

      if (dropboxFromFile) {
        console.log(
          "[AUTH CALLBACK] Restored Dropbox tokens from dropbox-by-user (multi-key lookup)",
        );
      } else if (userId && dropboxFromSession) {
        console.log(
          "[AUTH CALLBACK] Carried forward Dropbox tokens from existing session",
        );
      }
      if (userId && dropboxMerged) {
        setDropboxTokensForUser(userId, {
          dropboxToken: dropboxMerged.dropboxToken,
          dropboxRefreshToken: dropboxMerged.dropboxRefreshToken,
        });
        if (!dropboxFromFile && dropboxFromSession) {
          console.log(
            "[AUTH CALLBACK] Persisted session-only Dropbox tokens to dropbox-by-user",
          );
        }
      }
      if (userId && driveMerged) {
        setDriveTokensForUser(userId, driveMerged);
      }
      console.log("[AUTH CALLBACK] Session saved successfully");
    } catch (sessionError: any) {
      console.error(
        "[AUTH CALLBACK] Session save error:",
        sessionError?.message || sessionError,
      );
      return NextResponse.redirect(new URL("/?error=session_failed", baseUrl));
    }

    console.log(
      "[AUTH CALLBACK] Authentication complete, redirecting to dashboard",
    );
    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  } catch (error: any) {
    console.error("[AUTH CALLBACK] Unexpected error:", error?.message || error);
    console.error("[AUTH CALLBACK] Stack:", error?.stack);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
