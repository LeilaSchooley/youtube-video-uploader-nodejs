/**
 * Shared auth + queue-root resolution for manifest queue dashboard APIs.
 */

import { cookies } from "next/headers";
import type { OAuth2Client } from "google-auth-library";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { getDriveOAuthClientForSession } from "@/lib/auth-drive";
import {
  getQueueSourceForSession,
  isPythonManifestQueueSource,
} from "@/lib/queue-source";
import { jsonApiError } from "@/lib/api-response";

export type ManifestQueueDropboxAuth = {
  ok: true;
  sourceType: "dropbox_python_queue";
  sessionId: string;
  accessToken: string;
  refresh: string | null;
  queueRoot: string;
};

export type ManifestQueueDriveAuth = {
  ok: true;
  sourceType: "drive_python_queue";
  sessionId: string;
  driveClient: OAuth2Client;
  queueRoot: string;
};

export type ManifestQueueAuth =
  | ManifestQueueDropboxAuth
  | ManifestQueueDriveAuth
  | { ok: false; response: Response };

export async function requireManifestQueueAuth(): Promise<ManifestQueueAuth> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  if (!sessionId) {
    return {
      ok: false,
      response: jsonApiError("Not authenticated", 401, "UNAUTHORIZED"),
    };
  }

  const session = getSession(sessionId);
  if (!session?.authenticated) {
    return {
      ok: false,
      response: jsonApiError("Not authenticated", 401, "UNAUTHORIZED"),
    };
  }

  const qs = getQueueSourceForSession(sessionId);
  if (!qs || !isPythonManifestQueueSource(qs.sourceType)) {
    return {
      ok: false,
      response: jsonApiError(
        "Python manifest queue is not configured for this session",
        400,
        "NO_PYTHON_MANIFEST_QUEUE",
      ),
    };
  }

  if (qs.sourceType === "drive_python_queue") {
    const driveClient = await getDriveOAuthClientForSession(sessionId);
    if (!driveClient) {
      return {
        ok: false,
        response: jsonApiError(
          "Google Drive not connected",
          401,
          "DRIVE_REQUIRED",
        ),
      };
    }
    return {
      ok: true,
      sourceType: "drive_python_queue",
      sessionId,
      driveClient,
      queueRoot: qs.rootPath,
    };
  }

  if (!session.tokens) {
    return {
      ok: false,
      response: jsonApiError("Not authenticated", 401, "UNAUTHORIZED"),
    };
  }

  const accessToken = await getDropboxToken(
    session.dropboxToken,
    session.dropboxRefreshToken,
    sessionId,
  );
  if (!accessToken) {
    return {
      ok: false,
      response: jsonApiError("Dropbox not connected", 401, "DROPBOX_REQUIRED"),
    };
  }

  return {
    ok: true,
    sourceType: "dropbox_python_queue",
    sessionId,
    accessToken,
    refresh: session.dropboxRefreshToken ?? null,
    queueRoot: qs.rootPath,
  };
}

/** @deprecated Use requireManifestQueueAuth */
export async function requireManifestQueueDropboxAuth(): Promise<
  ManifestQueueDropboxAuth | { ok: false; response: Response }
> {
  const auth = await requireManifestQueueAuth();
  if (!auth.ok) return auth;
  if (auth.sourceType !== "dropbox_python_queue") {
    return {
      ok: false,
      response: jsonApiError(
        "Dropbox Python manifest queue is not configured for this session",
        400,
        "NO_DROPBOX_PYTHON_QUEUE",
      ),
    };
  }
  return auth;
}
