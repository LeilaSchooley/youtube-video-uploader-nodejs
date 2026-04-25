import { NextRequest, NextResponse } from "next/server";
import {
  deleteDropboxManifest,
  downloadAndParseManifest,
  listManifestJsonPathsSortedDropbox,
  mergeManifestJsonOnDropbox,
  moveDropboxManifestToFailed,
  moveDropboxManifestToManifests,
} from "@/lib/python-queue-dropbox";
import { isManifestPathUnderQueueRoot } from "@/lib/manifest-job-state";
import { requireManifestQueueDropboxAuth } from "@/lib/manifest-queue-api-auth";
import { jsonApiError } from "@/lib/api-response";
import { isTerminalManifestJob, buildManualRetryPatch } from "@/lib/manifest-job-state";
import {
  clearLastClearedPending,
  getLastClearedPending,
  setLastClearedPending,
  type ClearedManifestRecord,
} from "@/lib/manifest-clear-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireManifestQueueDropboxAuth();
    if (!auth.ok) return auth.response;

    let body: { action?: string; manifestId?: string; manifestPath?: string };
    try {
      body = (await request.json()) as { action?: string; manifestId?: string; manifestPath?: string };
    } catch {
      return jsonApiError("Invalid JSON body", 400, "BAD_REQUEST");
    }

    const action = body.action?.trim();
    if (!action) {
      return jsonApiError("action is required (delete, retry, delete-all, delete-pending, or undo-clear-pending)", 400, "BAD_REQUEST");
    }

    if (!["delete", "retry", "delete-all", "delete-pending", "undo-clear-pending"].includes(action)) {
      return jsonApiError("action must be delete, retry, delete-all, delete-pending, or undo-clear-pending", 400, "BAD_REQUEST");
    }

    if (action === "undo-clear-pending") {
      const records = getLastClearedPending(auth.queueRoot);
      if (records.length === 0) {
        return NextResponse.json({
          success: true,
          action,
          restored: 0,
        });
      }

      let restored = 0;
      const errors: string[] = [];

      for (const record of records) {
        try {
          await moveDropboxManifestToManifests(
            record.toPath,
            auth.queueRoot,
            auth.accessToken,
            auth.sessionId,
            auth.refresh,
          );
          await mergeManifestJsonOnDropbox(
            record.fromPath,
            buildManualRetryPatch(),
            auth.accessToken,
            auth.sessionId,
            auth.refresh,
          );
          restored++;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`${record.toPath}: ${msg}`);
        }
      }

      clearLastClearedPending(auth.queueRoot);

      if (errors.length > 0) {
        console.warn(`[MANIFEST-QUEUE-ACTION] Errors during undo clear pending: ${errors.join("; ")}`);
      }

      return NextResponse.json({
        success: true,
        action,
        restored,
        ...(errors.length > 0 && { warnings: errors }),
      });
    }

    // Single operations: delete one, retry one
    if (action === "delete" || action === "retry") {
      const manifestPath = (body.manifestPath ?? body.manifestId)?.trim();
      if (!manifestPath) {
        return jsonApiError("manifestPath (or manifestId) is required for single operations", 400, "BAD_REQUEST");
      }

      if (!isManifestPathUnderQueueRoot(manifestPath, auth.queueRoot)) {
        return jsonApiError(
          "manifestPath must be under this session's queue manifests folder",
          400,
          "INVALID_MANIFEST_PATH",
        );
      }

      if (action === "delete") {
        await deleteDropboxManifest(manifestPath, auth.accessToken, auth.sessionId, auth.refresh);
        return NextResponse.json({ success: true, action: "delete", deleted: 1 });
      }

      if (action === "retry") {
        const manifest = await downloadAndParseManifest(
          manifestPath,
          auth.accessToken,
          auth.sessionId,
          auth.refresh,
        );
        if (!manifest) {
          return jsonApiError("Manifest not found", 404, "NOT_FOUND");
        }

        const patch = buildManualRetryPatch();
        await mergeManifestJsonOnDropbox(
          manifestPath,
          patch,
          auth.accessToken,
          auth.sessionId,
          auth.refresh,
        );
        return NextResponse.json({ success: true, action: "retry" });
      }
    }

    // Batch operations: delete all terminal or clear pending
    if (action === "delete-all" || action === "delete-pending") {
      const paths = await listManifestJsonPathsSortedDropbox(
        auth.queueRoot,
        auth.accessToken,
        auth.sessionId,
        auth.refresh,
      );

      let deleted = 0;
      const clearedPendingRecords: ClearedManifestRecord[] = [];
      const errors: string[] = [];

      for (const manifestPath of paths) {
        try {
          const manifest = await downloadAndParseManifest(
            manifestPath,
            auth.accessToken,
            auth.sessionId,
            auth.refresh,
          );

          if (!manifest) continue;

          const isTerminal = isTerminalManifestJob(manifest);
          const status = manifest.upload_status ?? "queued";
          const isPending = !isTerminal && status !== "done";

          if (action === "delete-all" && isTerminal) {
            await deleteDropboxManifest(
              manifestPath,
              auth.accessToken,
              auth.sessionId,
              auth.refresh,
            );
            deleted++;
          }

          if (action === "delete-pending" && isPending) {
            const fileName = manifestPath.split("/").pop() || "";
            const failedPath = `${auth.queueRoot.replace(/\/+$/, "")}/failed/${fileName}`;

            await moveDropboxManifestToFailed(
              manifestPath,
              auth.queueRoot,
              auth.accessToken,
              auth.sessionId,
              auth.refresh,
            );
            clearedPendingRecords.push({
              fromPath: manifestPath,
              toPath: failedPath,
            });
            deleted++;
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`${manifestPath}: ${msg}`);
        }
      }

      if (action === "delete-pending") {
        setLastClearedPending(auth.queueRoot, clearedPendingRecords);
      }

      if (errors.length > 0) {
        console.warn(`[MANIFEST-QUEUE-ACTION] Errors during bulk delete: ${errors.join("; ")}`);
      }

      return NextResponse.json({
        success: true,
        action,
        deleted,
        ...(action === "delete-pending" && { canUndo: deleted > 0 }),
        ...(errors.length > 0 && { warnings: errors }),
      });
    }

    return jsonApiError("Unknown action", 400, "BAD_REQUEST");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Manifest action failed";
    console.error("[MANIFEST-QUEUE-ACTION]", message);
    return jsonApiError(message, 500, "ACTION_FAILED");
  }
}
