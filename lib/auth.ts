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
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile";

export function getOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
}

export function generateAuthUrl(): string {
  const oAuthClient = getOAuthClient();
  return oAuthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure refresh token is provided
    scope: scopes,
  });
}

export { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL };

