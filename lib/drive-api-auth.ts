import { jsonApiError } from "@/lib/api-response";
import {
  getDriveOAuthClientForSession,
  isGoogleDriveOAuthConfigured,
} from "@/lib/auth-drive";
import type { OAuth2Client } from "google-auth-library";

export type DriveClientResult =
  | { client: OAuth2Client }
  | { response: ReturnType<typeof jsonApiError> };

export async function requireDriveOAuthClient(
  sessionId: string,
): Promise<DriveClientResult> {
  if (!isGoogleDriveOAuthConfigured()) {
    return {
      response: jsonApiError(
        "Google Drive OAuth is not configured on the server (GOOGLE_DRIVE_CLIENT_ID).",
        503,
        "DRIVE_NOT_CONFIGURED",
      ),
    };
  }
  const client = await getDriveOAuthClientForSession(sessionId);
  if (!client) {
    return {
      response: jsonApiError(
        "Google Drive not connected. Use “Connect Google Drive” in the dashboard header.",
        401,
        "DRIVE_NOT_CONNECTED",
      ),
    };
  }
  return { client };
}
