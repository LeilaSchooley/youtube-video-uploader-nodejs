/**
 * Python manifest queue backed by Dropbox paths (per-session queue root).
 */

import path from "path";
import { Readable } from "stream";
import {
  downloadDropboxFile,
  uploadDropboxFile,
  listDropboxItems,
  moveDropboxFile,
  ensureDropboxFolder,
  getDropboxFileMetadata,
} from "@/lib/dropbox";
import { normalizeDropboxPath } from "@/lib/queue-source";
import type { ParsedManifestEntry, PythonManifest } from "@/lib/python-queue";
import { parseManifestJson } from "@/lib/python-queue";

/**
 * Manifests written by a local bot often contain OS-absolute paths. Those must
 * not be passed through as Dropbox paths (joinDropbox used to treat leading `/`
 * as a full Dropbox path). Map common shapes to paths relative to the queue root.
 */
function normalizeManifestPathForDropbox(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return t;

  const winAbs = /^[A-Za-z]:[\\/]/.test(t);
  if (winAbs) {
    t = t.replace(/\\/g, "/");
  }

  const uq = "/upload_queue/";
  const uqIdx = t.toLowerCase().indexOf(uq);
  if (uqIdx >= 0) {
    return t.slice(uqIdx + uq.length).replace(/^\/+/, "");
  }

  if (
    t.startsWith("/home/") ||
    t.startsWith("/Users/") ||
    t.startsWith("/private/")
  ) {
    let i = t.indexOf("/videos/");
    if (i >= 0) return t.slice(i + 1);
    i = t.indexOf("/thumbnails/");
    if (i >= 0) return t.slice(i + 1);
    const base = path.posix.basename(t);
    if (base) return `videos/${base}`;
    return t;
  }

  if (winAbs) {
    let i = t.toLowerCase().lastIndexOf("/videos/");
    if (i >= 0) return t.slice(i + 1);
    i = t.toLowerCase().lastIndexOf("/thumbnails/");
    if (i >= 0) return t.slice(i + 1);
    const base = path.posix.basename(t);
    if (base) return `videos/${base}`;
    return t;
  }

  if (!t.startsWith("/")) {
    let u = t.replace(/^\.?\//, "");
    // Queue root in Dropbox is already the bot "queue" folder; paths like queue/videos/… double up.
    if (/^queue\/(videos\/|thumbnails\/)/i.test(u)) {
      u = u.replace(/^queue\//i, "");
    }
    return u;
  }

  return t;
}

function joinDropbox(root: string, rel: string): string {
  const r = normalizeDropboxPath(root);
  const t = normalizeManifestPathForDropbox(rel).trim();
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

/** Raw JSON text (preserves unknown keys for merge updates). */
export async function downloadDropboxManifestRawJson(
  manifestDropboxPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<string | null> {
  try {
    const stream = await downloadDropboxFile(
      manifestDropboxPath,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    return await streamToString(stream);
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DBX] Failed to download manifest ${manifestDropboxPath}:`,
      e,
    );
    return null;
  }
}

/**
 * Merge keys into existing manifest JSON on Dropbox and overwrite the file.
 */
export async function mergeManifestJsonOnDropbox(
  manifestDropboxPath: string,
  patch: Record<string, unknown>,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<void> {
  const raw = await downloadDropboxManifestRawJson(
    manifestDropboxPath,
    accessToken,
    sessionId,
    refresh,
  );
  if (raw === null) {
    throw new Error(`Could not read manifest: ${manifestDropboxPath}`);
  }
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON in manifest: ${manifestDropboxPath}`);
  }
  const merged = { ...base, ...patch };
  const out = `${JSON.stringify(merged, null, 2)}\n`;
  await uploadDropboxFile(
    manifestDropboxPath,
    Buffer.from(out, "utf8"),
    accessToken,
    sessionId,
    refresh ?? null,
  );
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
