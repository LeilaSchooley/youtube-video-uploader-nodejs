/**
 * Python manifest queue backed by Dropbox paths (per-session queue root).
 */

import path from "path";
import { Readable } from "stream";
import {
  downloadDropboxFile,
  listDropboxItems,
  moveDropboxFile,
  ensureDropboxFolder,
  getDropboxFileMetadata,
} from "@/lib/dropbox";
import { normalizeDropboxPath } from "@/lib/queue-source";
import type { ParsedManifestEntry, PythonManifest } from "@/lib/python-queue";
import { parseManifestJson } from "@/lib/python-queue";

function joinDropbox(root: string, rel: string): string {
  const r = normalizeDropboxPath(root);
  const t = (rel || "").trim();
  if (!t) return r;
  if (t.startsWith("/")) return normalizeDropboxPath(t);
  const sub = t.replace(/^\.?\//, "");
  return normalizeDropboxPath(path.posix.join(r, sub));
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function downloadAndParseManifest(
  manifestDropboxPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<PythonManifest | null> {
  try {
    const stream = await downloadDropboxFile(
      manifestDropboxPath,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    const raw = await streamToString(stream);
    const data = JSON.parse(raw) as unknown;
    return parseManifestJson(data);
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DBX] Failed to parse manifest ${manifestDropboxPath}:`,
      e,
    );
    return null;
  }
}

/**
 * Dropbox paths to `*.json` in `queueRoot/manifests`, sorted by filename (worker tick).
 */
export async function listManifestJsonPathsSortedDropbox(
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<string[]> {
  const manifestsDir = joinDropbox(queueRoot, "manifests");
  let items: Awaited<ReturnType<typeof listDropboxItems>>;
  try {
    items = await listDropboxItems(
      manifestsDir,
      accessToken,
      sessionId,
      refresh ?? null,
    );
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DBX] Cannot list manifests dir ${manifestsDir}:`,
      e,
    );
    return [];
  }
  return items
    .filter(
      (i) => i.type === "file" && i.name.toLowerCase().endsWith(".json"),
    )
    .map((f) =>
      f.id.startsWith("/")
        ? normalizeDropboxPath(f.id)
        : normalizeDropboxPath(path.posix.join(manifestsDir, f.name)),
    )
    .sort((a, b) => a.localeCompare(b));
}

/**
 * List pending manifest entries under `queueRoot/manifests/*.json` on Dropbox.
 */
export async function listPendingManifestsFromDropboxSorted(
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<ParsedManifestEntry[]> {
  const manifestsDir = joinDropbox(queueRoot, "manifests");
  let items: Awaited<ReturnType<typeof listDropboxItems>>;
  try {
    items = await listDropboxItems(
      manifestsDir,
      accessToken,
      sessionId,
      refresh ?? null,
    );
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DBX] Cannot list manifests dir ${manifestsDir}:`,
      e,
    );
    return [];
  }

  const jsonFiles = items.filter(
    (i) => i.type === "file" && i.name.toLowerCase().endsWith(".json"),
  );

  const entries: ParsedManifestEntry[] = [];

  for (const f of jsonFiles) {
    const manifestPath = f.id.startsWith("/")
      ? normalizeDropboxPath(f.id)
      : joinDropbox(manifestsDir, f.name);
    const manifest = await downloadAndParseManifest(
      manifestPath,
      accessToken,
      sessionId,
      refresh,
    );
    if (!manifest) continue;
    const pr =
      typeof manifest.priority === "number" && !Number.isNaN(manifest.priority)
        ? manifest.priority
        : 0;
    entries.push({ manifestPath, manifest, priority: pr });
  }

  entries.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.manifestPath.localeCompare(b.manifestPath);
  });

  return entries;
}

export async function moveDropboxManifestToProcessed(
  manifestDropboxPath: string,
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<void> {
  const destDir = joinDropbox(queueRoot, "processed");
  await ensureDropboxFolder(
    destDir,
    accessToken,
    sessionId,
    refresh ?? null,
  );
  await moveDropboxFile(
    manifestDropboxPath,
    destDir,
    accessToken,
    sessionId,
    refresh ?? null,
  );
}

export async function moveDropboxManifestToFailed(
  manifestDropboxPath: string,
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<void> {
  const destDir = joinDropbox(queueRoot, "failed");
  await ensureDropboxFolder(
    destDir,
    accessToken,
    sessionId,
    refresh ?? null,
  );
  await moveDropboxFile(
    manifestDropboxPath,
    destDir,
    accessToken,
    sessionId,
    refresh ?? null,
  );
}

export async function dropboxVideoExists(
  queueRoot: string,
  videoRelPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<boolean> {
  const p = joinDropbox(queueRoot, videoRelPath);
  if (!p) return false;
  try {
    await getDropboxFileMetadata(
      p,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    return true;
  } catch {
    return false;
  }
}

export function resolveDropboxVideoPath(
  queueRoot: string,
  videoPath: string,
): string {
  return joinDropbox(queueRoot, videoPath);
}

export function resolveDropboxThumbnailPath(
  queueRoot: string,
  thumbRel: string,
): string {
  return joinDropbox(queueRoot, thumbRel);
}
