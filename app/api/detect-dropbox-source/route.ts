import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { detectDropboxPythonQueueLayout } from "@/lib/detect-dropbox-source";
import { normalizeDropboxPath } from "@/lib/queue-source";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
    );
    if (!dropboxToken) {
      return jsonApiError("Dropbox not connected", 401, "DROPBOX_REQUIRED");
    }

    let body: { dropboxPath?: string };
    try {
      body = (await request.json()) as { dropboxPath?: string };
    } catch {
      return jsonApiError("Invalid JSON body", 400, "BAD_REQUEST");
    }

    const rawPath = body.dropboxPath?.trim();
    if (!rawPath) {
      return jsonApiError("dropboxPath is required", 400, "BAD_REQUEST");
    }

    const dropboxPath = normalizeDropboxPath(rawPath);
    const result = await detectDropboxPythonQueueLayout(
      dropboxPath,
      dropboxToken,
      sessionId,
      session.dropboxRefreshToken ?? null,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Detection failed";
    console.error("[DETECT-DROPBOX-SOURCE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
