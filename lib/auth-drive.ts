/**
 * Separate Google Cloud OAuth client for Google Drive (verification project).
 * YouTube uploads continue to use GOOGLE_CLIENT_ID / lib/auth.ts.
 */

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
import { getSession, setSession } from "@/lib/session";

dotenv.config();

export const DRIVE_SCOPE_FILE =
  "https://www.googleapis.com/auth/drive.file";

/** Lists folders/files in the custom browser (pair with drive.file for uploads). */
export const DRIVE_SCOPE_METADATA_READONLY =
  "https://www.googleapis.com/auth/drive.metadata.readonly";

export const DRIVE_SCOPE_SPREADSHEETS_READONLY =
  "https://www.googleapis.com/auth/spreadsheets.readonly";

const DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
const DRIVE_REDIRECT_URI =
  process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() ||
  process.env.GOOGLE_REDIRECT_URI?.replace(
    "/api/auth/callback",
    "/api/auth/drive/callback",
  );

const DRIVE_SCOPES = (
  process.env.GOOGLE_DRIVE_SCOPES?.trim() ||
  `${DRIVE_SCOPE_FILE} ${DRIVE_SCOPE_METADATA_READONLY} ${DRIVE_SCOPE_SPREADSHEETS_READONLY}`
).split(/\s+/);

export function getDriveOAuthScopes(): string[] {
  return [...DRIVE_SCOPES];
}

export function driveTokenHasMetadataScope(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope.includes(DRIVE_SCOPE_METADATA_READONLY);
}

export function isGoogleDriveOAuthConfigured(): boolean {
  return !!(DRIVE_CLIENT_ID && DRIVE_CLIENT_SECRET && DRIVE_REDIRECT_URI);
}

export function getDriveRedirectUri(): string | undefined {
  return DRIVE_REDIRECT_URI;
}

export function getDriveOAuthClient(): OAuth2Client {
  if (!isGoogleDriveOAuthConfigured()) {
    throw new Error(
      "Google Drive OAuth not configured. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REDIRECT_URI.",
    );
  }
  return new google.auth.OAuth2(
    DRIVE_CLIENT_ID,
    DRIVE_CLIENT_SECRET,
    DRIVE_REDIRECT_URI,
  );
}

export function generateDriveAuthUrl(): string {
  const client = getDriveOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
  });
}

export type DriveTokenSet = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string | null;
};

/**
 * OAuth2 client with Drive tokens for this session (refreshes when expired).
 */
export async function getDriveOAuthClientForSession(
  sessionId: string,
): Promise<OAuth2Client | null> {
  const session = getSession(sessionId);
  const tokens = session?.driveTokens;
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return null;
  }
  if (!isGoogleDriveOAuthConfigured()) {
    return null;
  }

  const client = getDriveOAuthClient();
  client.setCredentials({
    ...tokens,
    scope: tokens.scope ?? undefined,
  });

  const expiry = tokens.expiry_date;
  const needsRefresh =
    tokens.refresh_token &&
    (!expiry || expiry <= Date.now() + 60_000);

  if (needsRefresh) {
    try {
      const { credentials } = await client.refreshAccessToken();
      const merged: DriveTokenSet = { ...tokens, ...credentials };
      if (session) {
        setSession(sessionId, { ...session, driveTokens: merged });
      }
      client.setCredentials({
        ...merged,
        scope: merged.scope ?? undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DRIVE AUTH] Token refresh failed:", msg);
      return null;
    }
  }

  return client;
}

export function sessionHasDriveTokens(sessionId: string): boolean {
  const session = getSession(sessionId);
  const t = session?.driveTokens;
  return !!(t?.access_token || t?.refresh_token);
}
