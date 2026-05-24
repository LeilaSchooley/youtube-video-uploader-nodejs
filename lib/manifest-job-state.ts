/**
 * In-place manifest job state (Dropbox + local PYTHON_QUEUE_ROOT) for upload retries.
 */

import fs from "fs";
import type { PythonManifest } from "@/lib/python-queue";
import { MANIFEST_MAX_AUTO_RETRIES } from "@/lib/manifest-upload-constants";
import type { OAuth2Client } from "google-auth-library";
import { mergeManifestJsonOnDropbox } from "@/lib/python-queue-dropbox";
import { mergeManifestJsonOnDrive } from "@/lib/python-queue-drive";
import { isDriveFileId } from "@/lib/drive";
import { normalizeDropboxPath } from "@/lib/queue-source";

export function mergeManifestJsonRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...patch };
}

export function isTerminalManifestJob(m: PythonManifest): boolean {
  const rc = m.retry_count ?? 0;
  return m.upload_status === "failed" && rc >= MANIFEST_MAX_AUTO_RETRIES;
}

export function shouldWorkerProcessManifest(m: PythonManifest): boolean {
  if (m.upload_status === "done") return false;
  if (isTerminalManifestJob(m)) return false;
  return true;
}

export function buildUploadFailurePatch(manifest: PythonManifest, error: string) {
  const prev = manifest.retry_count ?? 0;
  const err = (error || "upload_failed").slice(0, 4000);
  return {
    upload_status: "failed" as const,
    retry_count: prev + 1,
    last_error: err,
    last_attempt_at: new Date().toISOString(),
  };
}

export function buildManualRetryPatch() {
  return {
    upload_status: "queued" as const,
    retry_count: 0,
    last_error: "",
    last_attempt_at: "",
  };
}

export function mergeManifestJobPatchOnFs(
  manifestPath: string,
  patch: Record<string, unknown>,
): void {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const base = JSON.parse(raw) as Record<string, unknown>;
  const merged = mergeManifestJsonRecords(base, patch);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
}

export async function recordManifestUploadFailureOnDropbox(
  manifestDropboxPath: string,
  manifest: PythonManifest,
  error: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<void> {
  const patch = buildUploadFailurePatch(manifest, error);
  await mergeManifestJsonOnDropbox(
    manifestDropboxPath,
    patch,
    accessToken,
    sessionId,
    refresh,
  );
}

export async function recordManifestUploadFailureOnDrive(
  manifestFileId: string,
  manifest: PythonManifest,
  error: string,
  driveClient: OAuth2Client,
): Promise<void> {
  const patch = buildUploadFailurePatch(manifest, error);
  await mergeManifestJsonOnDrive(manifestFileId, patch, driveClient);
}

export function recordManifestUploadFailureOnFs(
  manifestPath: string,
  manifest: PythonManifest,
  error: string,
): void {
  const patch = buildUploadFailurePatch(manifest, error);
  mergeManifestJobPatchOnFs(manifestPath, patch);
}

/**
 * True if `manifestPath` is under `queueRoot/manifests/` (normalized Dropbox paths).
 */
export function isManifestPathUnderQueueRoot(
  manifestPath: string,
  queueRoot: string,
): boolean {
  if (isDriveFileId(manifestPath.trim())) {
    return isDriveFileId(queueRoot.trim()) && manifestPath.trim() !== queueRoot.trim();
  }
  const m = normalizeDropboxPath(manifestPath);
  const r = normalizeDropboxPath(queueRoot);
  const prefix = `${r}/manifests/`.replace(/\/+/g, "/");
  return m.startsWith(prefix) && m.toLowerCase().endsWith(".json");
}
