/**
 * Shared auth + queue-root resolution for manifest queue dashboard APIs.
 */

import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { getQueueSourceForSession } from "@/lib/queue-source";
import { jsonApiError } from "@/lib/api-response";

export type ManifestQueueDropboxAuth =
  | {
      ok: true;
      sessionId: string;
      accessToken: string;
      refresh: string | null;
      queueRoot: string;
    }
  | { ok: false; response: Response };

export async function requireManifestQueueDropboxAuth(): Promise<ManifestQueueDropboxAuth> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  if (!sessionId) {
    return {
      ok: false,
      response: jsonApiError("Not authenticated", 401, "UNAUTHORIZED"),
    };
  }

  const session = getSession(sessionId);
  if (!session?.authenticated || !session.tokens) {
    return {
      ok: false,
      response: jsonApiError("Not authenticated", 401, "UNAUTHORIZED"),
    };
  }

  const qs = getQueueSourceForSession(sessionId);
  if (!qs || qs.sourceType !== "dropbox_python_queue") {
    return {
      ok: false,
      response: jsonApiError(
        "Dropbox Python manifest queue is not configured for this session",
        400,
        "NO_DROPBOX_PYTHON_QUEUE",
      ),
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
    sessionId,
    accessToken,
    refresh: session.dropboxRefreshToken ?? null,
    queueRoot: qs.rootPath,
  };
}
