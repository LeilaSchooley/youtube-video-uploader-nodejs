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
  process.env.GOOGLE_CLIENT_ID ||
  (credentials?.web?.client_id);
const CLIENT_SECRET: string | undefined =
  process.env.GOOGLE_CLIENT_SECRET ||
  (credentials?.web?.client_secret);
const REDIRECT_URL: string | undefined =
  process.env.GOOGLE_REDIRECT_URI ||
  (credentials?.web?.redirect_uris?.[0]);

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
  console.warn(
    "Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env or provide creds.json. OAuth routes will not work until configured."
  );
}

const scopes =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
  // "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly"; // Disabled: Drive and Sheets

export function getOAuthClient(): OAuth2Client {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
    throw new Error("OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.");
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
}

export function generateAuthUrl(): string {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
    throw new Error("OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.");
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
const DROPBOX_REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || REDIRECT_URL?.replace('/api/auth/callback', '/api/auth/dropbox/callback');
// Generated Access Token (GAT) - long-lived token that doesn't expire
// Only used for the owner account (email must match DROPBOX_GAT_OWNER_EMAIL)
const DROPBOX_GENERATED_ACCESS_TOKEN = process.env.DROPBOX_GENERATED_ACCESS_TOKEN;
// Owner email - GAT will only be used for this user
const DROPBOX_GAT_OWNER_EMAIL = process.env.DROPBOX_GAT_OWNER_EMAIL;
// Whitelist emails - comma-separated list of emails that can use GAT (for internal testing)
const DROPBOX_GAT_WHITELIST_EMAILS = process.env.DROPBOX_GAT_WHITELIST_EMAILS
  ? process.env.DROPBOX_GAT_WHITELIST_EMAILS.split(',').map(e => e.trim().toLowerCase())
  : [];

// Log environment variable status on module load (only once, not on every call)
if (typeof process !== 'undefined') {
  const envCheck = {
    hasDropboxAppKey: !!DROPBOX_APP_KEY,
    hasDropboxAppSecret: !!DROPBOX_APP_SECRET,
    hasDropboxRedirectUri: !!DROPBOX_REDIRECT_URI,
    hasGAT: !!DROPBOX_GENERATED_ACCESS_TOKEN,
    gatLength: DROPBOX_GENERATED_ACCESS_TOKEN?.length || 0,
    hasGATOwnerEmail: !!DROPBOX_GAT_OWNER_EMAIL,
    gatOwnerEmail: DROPBOX_GAT_OWNER_EMAIL || 'NOT SET',
    hasGATWhitelist: DROPBOX_GAT_WHITELIST_EMAILS.length > 0,
    gatWhitelistCount: DROPBOX_GAT_WHITELIST_EMAILS.length,
    gatWhitelistEntries: DROPBOX_GAT_WHITELIST_EMAILS,
    nodeEnv: process.env.NODE_ENV,
    // Check if env vars exist in process.env (even if empty)
    envVarExists: {
      DROPBOX_GENERATED_ACCESS_TOKEN: 'DROPBOX_GENERATED_ACCESS_TOKEN' in process.env,
      DROPBOX_GAT_OWNER_EMAIL: 'DROPBOX_GAT_OWNER_EMAIL' in process.env,
      DROPBOX_GAT_WHITELIST_EMAILS: 'DROPBOX_GAT_WHITELIST_EMAILS' in process.env,
    }
  };
  console.log(`[DROPBOX-GAT] Environment check on module load:`, JSON.stringify(envCheck, null, 2));
}

/**
 * Generate Dropbox OAuth authorization URL
 * Scopes required for file browsing and downloading:
 * - files.metadata.read: Read file/folder metadata
 * - files.content.read: Download files
 * - files.content.write: For post-upload actions (rename, move, delete)
 */
export function generateDropboxAuthUrl(): string {
  if (!DROPBOX_APP_KEY || !DROPBOX_REDIRECT_URI) {
    throw new Error("Dropbox OAuth credentials not configured. Please set DROPBOX_APP_KEY and DROPBOX_REDIRECT_URI environment variables.");
  }
  
  // Required scopes for file operations
  const scopes = [
    'files.metadata.read',   // List files and folders
    'files.content.read',    // Download files
    'files.content.write',   // Rename, move, delete files
  ].join(' ');
  
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    redirect_uri: DROPBOX_REDIRECT_URI,
    response_type: 'code',
    token_access_type: 'offline', // Request refresh token
    scope: scopes, // Explicitly request required scopes
  });
  
  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange Dropbox authorization code for access token
 */
export async function exchangeDropboxCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REDIRECT_URI) {
    throw new Error("Dropbox OAuth credentials not configured.");
  }
  
  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
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
async function refreshDropboxToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string }> {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    throw new Error("Dropbox OAuth credentials not configured.");
  }
  
  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
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
 * Get Dropbox access token - checks Generated Access Token (GAT) first, then session token
 * Automatically refreshes expired tokens using refresh token if available
 * GAT is a long-lived token that doesn't expire, perfect for automated systems
 * GAT is only used for the owner account (matching DROPBOX_GAT_OWNER_EMAIL)
 */
export async function getDropboxToken(
  sessionToken?: string | null,
  sessionRefreshToken?: string | null,
  sessionId?: string,
  userEmail?: string | null
): Promise<string | undefined> {
  // Priority 1: Use Generated Access Token from environment (never expires)
  // BUT only if this is the owner's account or whitelisted email
  if (DROPBOX_GENERATED_ACCESS_TOKEN) {
    console.log(`[DROPBOX-GAT] GAT token is available (length: ${DROPBOX_GENERATED_ACCESS_TOKEN.length})`);
    console.log(`[DROPBOX-GAT] Owner email configured: ${DROPBOX_GAT_OWNER_EMAIL || 'NOT SET'}`);
    console.log(`[DROPBOX-GAT] Whitelist emails configured: ${DROPBOX_GAT_WHITELIST_EMAILS.length > 0 ? DROPBOX_GAT_WHITELIST_EMAILS.join(', ') : 'NONE'}`);
    console.log(`[DROPBOX-GAT] User email provided: ${userEmail || 'NOT PROVIDED'}`);
    
    if (userEmail) {
      const userEmailLower = userEmail.toLowerCase();
      console.log(`[DROPBOX-GAT] Checking user email (lowercase): "${userEmailLower}"`);
      
      // Check if user is the owner
      if (DROPBOX_GAT_OWNER_EMAIL) {
        const ownerEmailLower = DROPBOX_GAT_OWNER_EMAIL.toLowerCase();
        console.log(`[DROPBOX-GAT] Comparing with owner email (lowercase): "${ownerEmailLower}"`);
        if (userEmailLower === ownerEmailLower) {
          console.log(`[DROPBOX-GAT] ✓ MATCH: Using GAT for owner account: ${userEmail}`);
          console.log(`[DROPBOX-GAT] GAT token details: length=${DROPBOX_GENERATED_ACCESS_TOKEN.length}, starts with: ${DROPBOX_GENERATED_ACCESS_TOKEN.substring(0, 15)}...`);
          console.log(`[DROPBOX-GAT] Returning GAT token to caller`);
          return DROPBOX_GENERATED_ACCESS_TOKEN;
        } else {
          console.log(`[DROPBOX-GAT] ✗ NO MATCH: User email does not match owner email`);
        }
      } else {
        console.log(`[DROPBOX-GAT] Owner email not configured, skipping owner check`);
      }
      
      // Check if user is in whitelist (supports partial matching)
      if (DROPBOX_GAT_WHITELIST_EMAILS.length > 0) {
        console.log(`[DROPBOX-GAT] Checking whitelist (${DROPBOX_GAT_WHITELIST_EMAILS.length} entries)...`);
        let matchedEntry: string | null = null;
        const isWhitelisted = DROPBOX_GAT_WHITELIST_EMAILS.some(whitelistEmail => {
          const whitelistEmailLower = whitelistEmail.toLowerCase();
          const exactMatch = userEmailLower === whitelistEmailLower;
          const userContainsWhitelist = userEmailLower.includes(whitelistEmailLower);
          const whitelistContainsUser = whitelistEmailLower.includes(userEmailLower);
          
          console.log(`[DROPBOX-GAT]   Comparing with whitelist entry: "${whitelistEmailLower}"`);
          console.log(`[DROPBOX-GAT]     Exact match: ${exactMatch}`);
          console.log(`[DROPBOX-GAT]     User contains whitelist: ${userContainsWhitelist} (user: "${userEmailLower}" contains "${whitelistEmailLower}")`);
          console.log(`[DROPBOX-GAT]     Whitelist contains user: ${whitelistContainsUser} ("${whitelistEmailLower}" contains "${userEmailLower}")`);
          
          const matches = exactMatch || userContainsWhitelist || whitelistContainsUser;
          if (matches) {
            matchedEntry = whitelistEmail;
            console.log(`[DROPBOX-GAT]     ✓ MATCH FOUND with entry: "${whitelistEmail}"`);
          } else {
            console.log(`[DROPBOX-GAT]     ✗ NO MATCH`);
          }
          
          return matches;
        });
        
        if (isWhitelisted && matchedEntry) {
          console.log(`[DROPBOX-GAT] ✓ Using GAT for whitelisted account: ${userEmail} (matched entry: "${matchedEntry}")`);
          console.log(`[DROPBOX-GAT] GAT token details: length=${DROPBOX_GENERATED_ACCESS_TOKEN.length}, starts with: ${DROPBOX_GENERATED_ACCESS_TOKEN.substring(0, 15)}...`);
          console.log(`[DROPBOX-GAT] Returning GAT token to caller`);
          return DROPBOX_GENERATED_ACCESS_TOKEN;
        } else {
          console.log(`[DROPBOX-GAT] ✗ User email did not match any whitelist entries`);
        }
      } else {
        console.log(`[DROPBOX-GAT] Whitelist is empty, skipping whitelist check`);
      }
      
      // Not the owner or whitelisted - don't use GAT, fall through to OAuth token
      if (DROPBOX_GAT_OWNER_EMAIL || DROPBOX_GAT_WHITELIST_EMAILS.length > 0) {
        console.log(`[DROPBOX-GAT] ✗ GAT available but user ${userEmail} is not the owner (${DROPBOX_GAT_OWNER_EMAIL || 'N/A'}) or whitelisted. Falling back to OAuth token.`);
      }
    } else {
      // No user email available - check if we should use GAT anyway
      console.log(`[DROPBOX-GAT] No user email provided`);
      if (!DROPBOX_GAT_OWNER_EMAIL && DROPBOX_GAT_WHITELIST_EMAILS.length === 0) {
        // No owner email or whitelist configured - use GAT for everyone (backward compatibility)
        // WARNING: This means all users share the same Dropbox account
        console.warn(`[DROPBOX-GAT] ⚠️ GAT is set but DROPBOX_GAT_OWNER_EMAIL and DROPBOX_GAT_WHITELIST_EMAILS are not configured. GAT will be used for ALL users.`);
        return DROPBOX_GENERATED_ACCESS_TOKEN;
      } else {
        console.log(`[DROPBOX-GAT] ✗ Cannot use GAT: owner/whitelist is configured but no user email provided`);
      }
    }
  } else {
    console.log(`[DROPBOX-GAT] GAT token is NOT available in environment`);
  }
  
  // Priority 2: Use token from session (OAuth flow)
  // If we have both access token and refresh token, return access token
  // If it's expired, API calls will fail with 401 and we can refresh then
  if (sessionToken) {
    console.log(`[DROPBOX-GAT] Using OAuth session token (GAT not used or not available)`);
    console.log(`[DROPBOX-GAT] OAuth token details: length=${sessionToken.length}, starts with: ${sessionToken.substring(0, 15)}...`);
    return sessionToken;
  }
  
  // Priority 3: No access token but have refresh token - refresh now
  if (sessionRefreshToken && sessionId) {
    try {
      console.log(`[DROPBOX] Access token missing, attempting to refresh using refresh token...`);
      const { getSession, setSession } = await import("./session");
      const tokenData = await refreshDropboxToken(sessionRefreshToken);
      
      // Update session with new tokens
      const session = getSession(sessionId);
      if (session) {
        setSession(sessionId, {
          ...session,
          dropboxToken: tokenData.access_token,
          dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
        });
        console.log(`[DROPBOX] Successfully refreshed access token`);
        return tokenData.access_token;
      }
    } catch (error: any) {
      console.error(`[DROPBOX] Failed to refresh token:`, error?.message || error);
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
  sessionRefreshToken?: string | null
): Promise<string | undefined> {
  // Check if error is 401/unauthorized
  const isUnauthorized = 
    error?.status === 401 ||
    error?.statusCode === 401 ||
    error?.message?.includes('401') ||
    error?.message?.includes('unauthorized') ||
    error?.message?.includes('expired');
  
  if (!isUnauthorized || !sessionRefreshToken) {
    return undefined;
  }
  
  try {
    console.log(`[DROPBOX] Token expired (401 error), refreshing using refresh token...`);
    const { getSession, setSession } = await import("./session");
    const tokenData = await refreshDropboxToken(sessionRefreshToken);
    
    // Update session with new tokens
    const session = getSession(sessionId);
    if (session) {
      setSession(sessionId, {
        ...session,
        dropboxToken: tokenData.access_token,
        dropboxRefreshToken: tokenData.refresh_token || sessionRefreshToken,
      });
      console.log(`[DROPBOX] Successfully refreshed expired token`);
      return tokenData.access_token;
    }
  } catch (refreshError: any) {
    console.error(`[DROPBOX] Failed to refresh expired token:`, refreshError?.message || refreshError);
  }
  
  return undefined;
}

/**
 * Check if a token is the Generated Access Token (GAT)
 * GAT tokens don't expire, so if they get 401, it means the token is invalid/revoked
 */
export function isGATToken(token: string): boolean {
  return !!DROPBOX_GENERATED_ACCESS_TOKEN && token === DROPBOX_GENERATED_ACCESS_TOKEN;
}

export { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL, DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REDIRECT_URI, DROPBOX_GENERATED_ACCESS_TOKEN, DROPBOX_GAT_OWNER_EMAIL, DROPBOX_GAT_WHITELIST_EMAILS };

