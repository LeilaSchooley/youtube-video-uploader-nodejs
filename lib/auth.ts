import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

interface Credentials {
  web?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
}

let credentials: Credentials | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  const credsPath = path.join(process.cwd(), "src", "creds.json");
  if (fs.existsSync(credsPath)) {
    const credsContent = fs.readFileSync(credsPath, "utf8");
    credentials = JSON.parse(credsContent) as Credentials;
  }
} catch (e) {
  // creds.json not present — falling back to environment variables
}

const CLIENT_ID: string | undefined =
  process.env.GOOGLE_CLIENT_ID || credentials?.web?.client_id;
const CLIENT_SECRET: string | undefined =
  process.env.GOOGLE_CLIENT_SECRET || credentials?.web?.client_secret;
const REDIRECT_URL: string | undefined =
  process.env.GOOGLE_REDIRECT_URI || credentials?.web?.redirect_uris?.[0];

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
  console.warn(
    "Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env or provide creds.json. OAuth routes will not work until configured.",
  );
}

// When true, request only YouTube + openid (no userinfo.profile/email). User ID comes from id_token sub.
const DISABLE_GOOGLE_EXTRA_SCOPES =
  process.env.DISABLE_GOOGLE_SCOPES === "true" ||
  process.env.GOOGLE_MINIMAL_SCOPES === "true";

const GOOGLE_SCOPES_FULL =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

// YouTube-only (no openid/userinfo). Use when Cloud project restricts to YouTube scopes only.
const GOOGLE_SCOPES_MINIMAL =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

const scopes = process.env.GOOGLE_SCOPES
  ? process.env.GOOGLE_SCOPES
  : DISABLE_GOOGLE_EXTRA_SCOPES
    ? GOOGLE_SCOPES_MINIMAL
    : GOOGLE_SCOPES_FULL;

export function getOAuthClient(): OAuth2Client {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
    throw new Error(
      "OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.",
    );
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
}

export function generateAuthUrl(): string {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
    throw new Error(
      "OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.",
    );
  }
  const oAuthClient = getOAuthClient();
  return oAuthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure refresh token is provided
    scope: scopes,
  });
}

// Dropbox OAuth configuration
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REDIRECT_URI =
  process.env.DROPBOX_REDIRECT_URI ||
  REDIRECT_URL?.replace("/api/auth/callback", "/api/auth/dropbox/callback");
/**
 * Generate Dropbox OAuth authorization URL
 * Scopes required for file browsing and downloading:
 * - files.metadata.read: Read file/folder metadata
 * - files.content.read: Download files
 * - files.content.write: For post-upload actions (rename, move, delete)
 */
export function generateDropboxAuthUrl(): string {
  if (!DROPBOX_APP_KEY || !DROPBOX_REDIRECT_URI) {
    throw new Error(
      "Dropbox OAuth credentials not configured. Please set DROPBOX_APP_KEY and DROPBOX_REDIRECT_URI environment variables.",
    );
  }

  // Required scopes for file operations
  const scopes = [
    "files.metadata.read", // List files and folders
    "files.content.read", // Download files
    "files.content.write", // Rename, move, delete files
  ].join(" ");

  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    redirect_uri: DROPBOX_REDIRECT_URI,
    response_type: "code",
    token_access_type: "offline", // Request refresh token
    scope: scopes, // Explicitly request required scopes
  });

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange Dropbox authorization code for access token
 */
export async function exchangeDropboxCode(
  code: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REDIRECT_URI) {
    throw new Error("Dropbox OAuth credentials not configured.");
  }

  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
      redirect_uri: DROPBOX_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Dropbox token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token, // Dropbox may not always provide refresh token
  };
}

/**
 * Refresh Dropbox access token using refresh token
 */
async function refreshDropboxToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    throw new Error("Dropbox OAuth credentials not configured.");
  }

  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Dropbox token refresh failed: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // Keep old refresh token if new one not provided
  };
}

/**
 * Get Dropbox access token from session (OAuth flow).
 * Automatically refreshes expired tokens using refresh token if available.
 */
export async function getDropboxToken(
  sessionToken?: string | null,
  sessionRefreshToken?: string | null,
  sessionId?: string,
): Promise<string | undefined> {
  // Use token from session (OAuth flow)
  if (sessionToken) {
    return sessionToken;
  }

  // No access token but have refresh token - refresh now
  if (sessionRefreshToken && sessionId) {
    try {
      console.log(
        `[DROPBOX] Access token missing, attempting to refresh using refresh token...`,
      );
      const { getSession, setSession } = await import("./session");
      const { setDropboxTokensForUser } = await import("./dropbox-by-user");
      const tokenData = await refreshDropboxToken(sessionRefreshToken);

      // Update session with new tokens
      const session = getSession(sessionId);
      if (session) {
        setSession(sessionId, {
          ...session,
          dropboxToken: tokenData.access_token,
          dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
        });
        if (session.userId) {
          setDropboxTokensForUser(session.userId, {
            dropboxToken: tokenData.access_token,
            dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
          });
        }
        console.log(`[DROPBOX] Successfully refreshed access token`);
        return tokenData.access_token;
      }
    } catch (error: any) {
      console.error(
        `[DROPBOX] Failed to refresh token:`,
        error?.message || error,
      );
      // Return undefined - user will need to re-authenticate
    }
  }

  return undefined;
}

/**
 * Refresh Dropbox token if API call fails with 401
 * This is called automatically when Dropbox API returns unauthorized
 */
export async function refreshDropboxTokenIfNeeded(
  error: any,
  sessionId: string,
  sessionRefreshToken?: string | null,
): Promise<string | undefined> {
  // Check if error is 401/unauthorized
  const isUnauthorized =
    error?.status === 401 ||
    error?.statusCode === 401 ||
    error?.message?.includes("401") ||
    error?.message?.includes("unauthorized") ||
    error?.message?.includes("expired");

  if (!isUnauthorized || !sessionRefreshToken) {
    return undefined;
  }

  try {
    console.log(
      `[DROPBOX] Token expired (401 error), refreshing using refresh token...`,
    );
    const { getSession, setSession } = await import("./session");
    const { setDropboxTokensForUser } = await import("./dropbox-by-user");
    const tokenData = await refreshDropboxToken(sessionRefreshToken);

    // Update session with new tokens
    const session = getSession(sessionId);
    if (session) {
      setSession(sessionId, {
        ...session,
        dropboxToken: tokenData.access_token,
        dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
      });
      if (session.userId) {
        setDropboxTokensForUser(session.userId, {
          dropboxToken: tokenData.access_token,
          dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
        });
      }
      console.log(`[DROPBOX] Successfully refreshed expired token`);
      return tokenData.access_token;
    }
  } catch (refreshError: any) {
    console.error(
      `[DROPBOX] Failed to refresh expired token:`,
      refreshError?.message || refreshError,
    );
  }

  return undefined;
}

export {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL,
  DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET,
  DROPBOX_REDIRECT_URI,
};
