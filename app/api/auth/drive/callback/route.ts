import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getDriveOAuthClient,
  isGoogleDriveOAuthConfigured,
} from "@/lib/auth-drive";
import { generateSessionId, getSession, setSession } from "@/lib/session";
import { setDriveTokensForUser } from "@/lib/drive-by-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function baseUrlFromRequest(request: NextRequest): string {
  const rawHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3000";
  const host = rawHost.split(",")[0].trim();
  const rawProtocol =
    request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");
  const protocol = rawProtocol.split(",")[0].trim();
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");

  if (error) {
    console.error(`[DRIVE AUTH CALLBACK] Google OAuth error: ${error}`);
    return NextResponse.redirect(
      new URL(`/?error=drive_oauth_${error}`, baseUrl),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?error=drive_no_code", baseUrl));
  }

  if (!isGoogleDriveOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/?error=drive_oauth_not_configured", baseUrl),
    );
  }

  try {
    const client = getDriveOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token && !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/?error=drive_token_exchange_failed", baseUrl),
      );
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      sessionId = generateSessionId();
      cookieStore.set("sessionId", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    const existing = getSession(sessionId);
    const driveTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };
    setSession(sessionId, {
      ...existing,
      authenticated: existing?.authenticated ?? false,
      driveTokens,
    });
    if (existing?.userId) {
      setDriveTokensForUser(existing.userId, driveTokens);
    }

    return NextResponse.redirect(
      new URL("/dashboard?drive_connected=1", baseUrl),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DRIVE AUTH CALLBACK]", message);
    return NextResponse.redirect(new URL("/?error=drive_auth_failed", baseUrl));
  }
}
