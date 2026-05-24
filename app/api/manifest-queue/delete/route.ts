import { NextRequest, NextResponse } from "next/server";
import { isManifestPathUnderQueueRoot } from "@/lib/manifest-job-state";
import { requireManifestQueueAuth } from "@/lib/manifest-queue-api-auth";
import { deleteManifestForAuth } from "@/lib/manifest-queue-helpers";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireManifestQueueAuth();
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
        "manifestPath must belong to this session's queue",
        400,
        "INVALID_MANIFEST_PATH",
      );
    }

    await deleteManifestForAuth(auth, manifestPath);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Manifest delete failed";
    console.error("[MANIFEST-QUEUE-DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
