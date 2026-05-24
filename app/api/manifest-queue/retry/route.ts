import { NextRequest, NextResponse } from "next/server";
import {
  buildManualRetryPatch,
  isManifestPathUnderQueueRoot,
} from "@/lib/manifest-job-state";
import { requireManifestQueueAuth } from "@/lib/manifest-queue-api-auth";
import { mergeManifestPatchForAuth } from "@/lib/manifest-queue-helpers";
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

    await mergeManifestPatchForAuth(
      auth,
      manifestPath,
      buildManualRetryPatch() as Record<string, unknown>,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Manifest retry failed";
    console.error("[MANIFEST-QUEUE-RETRY]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
