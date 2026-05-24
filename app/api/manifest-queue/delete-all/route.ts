import { NextResponse } from "next/server";
import { requireManifestQueueAuth } from "@/lib/manifest-queue-api-auth";
import {
  deleteManifestForAuth,
  downloadManifestForAuth,
  listManifestPathsSorted,
} from "@/lib/manifest-queue-helpers";
import { isTerminalManifestJob } from "@/lib/manifest-job-state";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const auth = await requireManifestQueueAuth();
    if (!auth.ok) return auth.response;

    const paths = await listManifestPathsSorted(auth);

    let deleted = 0;
    const errors: string[] = [];

    for (const manifestPath of paths) {
      try {
        const manifest = await downloadManifestForAuth(auth, manifestPath);
        if (!manifest) continue;

        if (isTerminalManifestJob(manifest)) {
          await deleteManifestForAuth(auth, manifestPath);
          deleted++;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${manifestPath}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.warn(
        `[MANIFEST-QUEUE-DELETE-ALL] Errors during bulk delete: ${errors.join("; ")}`,
      );
    }

    return NextResponse.json({
      success: true,
      deleted,
      ...(errors.length > 0 && { warnings: errors }),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Delete all failed";
    console.error("[MANIFEST-QUEUE-DELETE-ALL]", message);
    return jsonApiError(message, 500, "DELETE_ALL_FAILED");
  }
}
