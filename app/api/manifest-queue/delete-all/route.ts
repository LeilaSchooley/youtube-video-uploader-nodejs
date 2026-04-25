import { NextResponse } from "next/server";
import { deleteDropboxManifest } from "@/lib/python-queue-dropbox";
import { requireManifestQueueDropboxAuth } from "@/lib/manifest-queue-api-auth";
import { listManifestJsonPathsSortedDropbox } from "@/lib/python-queue-dropbox";
import { downloadAndParseManifest } from "@/lib/python-queue-dropbox";
import { isTerminalManifestJob } from "@/lib/manifest-job-state";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const auth = await requireManifestQueueDropboxAuth();
    if (!auth.ok) return auth.response;

    // List all manifest paths
    const paths = await listManifestJsonPathsSortedDropbox(
      auth.queueRoot,
      auth.accessToken,
      auth.sessionId,
      auth.refresh,
    );

    let deleted = 0;
    const errors: string[] = [];

    // Check each manifest and delete if terminal
    for (const manifestPath of paths) {
      try {
        const manifest = await downloadAndParseManifest(
          manifestPath,
          auth.accessToken,
          auth.sessionId,
          auth.refresh,
        );

        if (!manifest) continue;

        if (isTerminalManifestJob(manifest)) {
          await deleteDropboxManifest(
            manifestPath,
            auth.accessToken,
            auth.sessionId,
            auth.refresh,
          );
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
