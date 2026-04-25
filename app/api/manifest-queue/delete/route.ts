import { NextRequest, NextResponse } from "next/server";
import { deleteDropboxManifest } from "@/lib/python-queue-dropbox";
import { isManifestPathUnderQueueRoot } from "@/lib/manifest-job-state";
import { requireManifestQueueDropboxAuth } from "@/lib/manifest-queue-api-auth";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireManifestQueueDropboxAuth();
    if (!auth.ok) return auth.response;

    let body: { manifestPath?: string };
    try {
      body = (await request.json()) as { manifestPath?: string };
    } catch {
      return jsonApiError("Invalid JSON body", 400, "BAD_REQUEST");
    }

    const manifestPath = body.manifestPath?.trim();
    if (!manifestPath) {
      return jsonApiError("manifestPath is required", 400, "BAD_REQUEST");
    }

    if (!isManifestPathUnderQueueRoot(manifestPath, auth.queueRoot)) {
      return jsonApiError(
        "manifestPath must be under this session's queue manifests folder",
        400,
        "INVALID_MANIFEST_PATH",
      );
    }

    await deleteDropboxManifest(
      manifestPath,
      auth.accessToken,
      auth.sessionId,
      auth.refresh,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Manifest delete failed";
    console.error("[MANIFEST-QUEUE-DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
