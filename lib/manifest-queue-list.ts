/**
 * Build manifest job rows for the Queue Dashboard API (Dropbox queue root).
 */

import type { PythonManifest } from "@/lib/python-queue";
import { normalizeManifest } from "@/lib/python-queue";
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
  videoType: string;
  isShort: boolean;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await mapper(items[index], index);
    }
  }

  const width = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}

function rowFromManifest(
  manifestPath: string,
  manifest: PythonManifest,
  videoReady: boolean,
): ManifestQueueRow {
  const st = manifest.upload_status ?? "queued";
  const rc = manifest.retry_count ?? 0;
  const terminal = isTerminalManifestJob(manifest);
  const norm = normalizeManifest(manifest);
  return {
    manifestPath,
    title: manifest.title,
    videoPath: manifest.videoPath,
    videoReady,
    upload_status: st,
    retry_count: rc,
    last_error: (manifest.last_error ?? "").slice(0, 500),
    terminal,
    videoType: norm.videoType,
    isShort: norm.isShort,
  };
}

export async function listManifestQueueRows(
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<ManifestQueueRow[]> {
  /** Keep low: parallel manifest reads + video checks can trigger Dropbox 429. */
  const MANIFEST_ROW_CONCURRENCY = 2;
  const paths = await listManifestJsonPathsSortedDropbox(
    queueRoot,
    accessToken,
    sessionId,
    refresh,
  );

  const rows = await mapWithConcurrency(
    paths,
    MANIFEST_ROW_CONCURRENCY,
    async (manifestPath): Promise<ManifestQueueRow | null> => {
      const manifest = await downloadAndParseManifest(
        manifestPath,
        accessToken,
        sessionId,
        refresh,
      );
      if (!manifest) return null;

      const status = manifest.upload_status ?? "queued";
      const videoReady =
        status === "done"
          ? true
          : await dropboxVideoExists(
              queueRoot,
              manifest.videoPath,
              accessToken,
              sessionId,
              refresh,
            );

      return rowFromManifest(manifestPath, manifest, videoReady);
    },
  );

  const nonNullRows = rows.filter((row): row is ManifestQueueRow => row !== null);

  // Auto-prune completed entries from Activity view.
  // A manifest with upload_status="done" should normally be moved to processed/ and
  // not remain in queue/manifests. If it lingers (e.g., Dropbox move conflict), hide it.
  return nonNullRows.filter((row) => row.upload_status !== "done");
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
    "video_type",
    "is_short",
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
        esc(r.videoType),
        r.isShort ? "true" : "false",
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function filterFailedRows(rows: ManifestQueueRow[]): ManifestQueueRow[] {
  return rows.filter((r) => r.upload_status === "failed");
}
