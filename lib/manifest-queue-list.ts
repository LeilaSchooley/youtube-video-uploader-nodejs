/**
 * Build manifest job rows for the Queue Dashboard API (Dropbox queue root).
 */

import type { PythonManifest } from "@/lib/python-queue";
import {
  listManifestJsonPathsSortedDropbox,
  downloadAndParseManifest,
  dropboxVideoExists,
} from "@/lib/python-queue-dropbox";
import { isTerminalManifestJob } from "@/lib/manifest-job-state";

export interface ManifestQueueRow {
  manifestPath: string;
  title: string;
  videoPath: string;
  videoReady: boolean;
  upload_status: string;
  retry_count: number;
  last_error: string;
  terminal: boolean;
}

function rowFromManifest(
  manifestPath: string,
  manifest: PythonManifest,
  videoReady: boolean,
): ManifestQueueRow {
  const st = manifest.upload_status ?? "queued";
  const rc = manifest.retry_count ?? 0;
  const terminal = isTerminalManifestJob(manifest);
  return {
    manifestPath,
    title: manifest.title,
    videoPath: manifest.videoPath,
    videoReady,
    upload_status: st,
    retry_count: rc,
    last_error: (manifest.last_error ?? "").slice(0, 500),
    terminal,
  };
}

export async function listManifestQueueRows(
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<ManifestQueueRow[]> {
  const paths = await listManifestJsonPathsSortedDropbox(
    queueRoot,
    accessToken,
    sessionId,
    refresh,
  );
  const rows: ManifestQueueRow[] = [];
  for (const manifestPath of paths) {
    const manifest = await downloadAndParseManifest(
      manifestPath,
      accessToken,
      sessionId,
      refresh,
    );
    if (!manifest) continue;
    const videoReady = await dropboxVideoExists(
      queueRoot,
      manifest.videoPath,
      accessToken,
      sessionId,
      refresh,
    );
    rows.push(rowFromManifest(manifestPath, manifest, videoReady));
  }
  return rows;
}

export function manifestRowsToCsv(rows: ManifestQueueRow[]): string {
  const header = [
    "manifestPath",
    "title",
    "videoPath",
    "videoReady",
    "upload_status",
    "retry_count",
    "terminal",
    "last_error",
  ];
  const esc = (s: string) => {
    const t = String(s ?? "").replace(/"/g, '""');
    return `"${t}"`;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        esc(r.manifestPath),
        esc(r.title),
        esc(r.videoPath),
        r.videoReady ? "true" : "false",
        esc(r.upload_status),
        String(r.retry_count),
        r.terminal ? "true" : "false",
        esc(r.last_error),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function filterFailedRows(rows: ManifestQueueRow[]): ManifestQueueRow[] {
  return rows.filter((r) => r.upload_status === "failed");
}
