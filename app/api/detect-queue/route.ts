import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { detectDropboxQueueAuto } from "@/lib/detect-dropbox-queue-auto";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bounded auto-discovery of a Dropbox Python manifest queue for Queue Mode.
 * Optional `?preferred=` query (normalized Dropbox path) tries that root first.
 */
export async function GET(request: NextRequest) {
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

    const preferred = request.nextUrl.searchParams.get("preferred")?.trim();

    const result = await detectDropboxQueueAuto(
      dropboxToken,
      sessionId,
      session.dropboxRefreshToken ?? null,
      preferred ? { preferredPath: preferred } : undefined,
    );

    return NextResponse.json({
      success: true,
      found: result.found,
      path: result.path ?? null,
      manifestCount: result.manifestCount ?? 0,
      videoCount: result.videoCount ?? 0,
      thumbnailCount: result.thumbnailCount ?? 0,
      validatedSample: result.validatedSample ?? false,
      reason: result.reason ?? null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Detection failed";
    console.error("[DETECT-QUEUE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
