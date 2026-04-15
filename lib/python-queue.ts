/**
 * Filesystem queue for Python bot manifests (JSON) under PYTHON_QUEUE_ROOT/manifests/.
 * The worker consumes these alongside bulk-queue.json jobs; no HTTP API.
 */

import fs from "fs";
import path from "path";

export interface PythonManifest {
  id?: string;
  title: string;
  description: string;
  /** Absolute path or path relative to PYTHON_QUEUE_ROOT */
  videoPath: string;
  thumbnailPath?: string;
  /** Overrides PYTHON_SESSION_ID when set */
  sessionId?: string;
  privacyStatus?: "public" | "private" | "unlisted";
  publishDate?: string;
  madeForKids?: boolean;
  /** Higher runs first when listing pending jobs */
  priority?: number;
}

export interface ParsedManifestEntry {
  /** Local filesystem path or Dropbox lower path */
  manifestPath: string;
  manifest: PythonManifest;
  priority: number;
}

function getQueueRoot(): string | null {
  const root = process.env.PYTHON_QUEUE_ROOT?.trim();
  if (!root) return null;
  return path.resolve(root);
}

export function isPythonQueueEnabled(): boolean {
  return getQueueRoot() !== null;
}

export function getPythonQueueRoot(): string | null {
  return getQueueRoot();
}

function manifestsDir(root: string): string {
  return path.join(root, "manifests");
}

function processedDir(root: string): string {
  return path.join(root, "processed");
}

function failedDir(root: string): string {
  return path.join(root, "failed");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Try to create an exclusive lock file (manifestPath + ".lock").
 * Returns true if this worker owns the lock.
 */
export function tryAcquireLock(manifestPath: string): boolean {
  const lockPath = `${manifestPath}.lock`;
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeSync(fd, `${process.pid}\n`, 0, "utf8");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(manifestPath: string): void {
  const lockPath = `${manifestPath}.lock`;
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // ignore
  }
}

function safeMoveFile(src: string, destDir: string): string {
  ensureDir(destDir);
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  try {
    fs.renameSync(src, dest);
    return dest;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EXDEV") {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
      return dest;
    }
    throw err;
  }
}

export function moveManifestToProcessed(manifestPath: string): string {
  const root = getQueueRoot();
  if (!root) throw new Error("PYTHON_QUEUE_ROOT not set");
  return safeMoveFile(manifestPath, processedDir(root));
}

export function moveManifestToFailed(
  manifestPath: string,
  reason?: string,
): string {
  const root = getQueueRoot();
  if (!root) throw new Error("PYTHON_QUEUE_ROOT not set");
  const dest = safeMoveFile(manifestPath, failedDir(root));
  if (reason) {
    try {
      fs.writeFileSync(`${dest}.reason.txt`, reason, "utf8");
    } catch {
      // ignore
    }
  }
  return dest;
}

export function resolveUnderQueueRoot(
  queueRoot: string,
  p: string,
): string {
  if (!p || !p.trim()) return "";
  const trimmed = p.trim();
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.normalize(path.join(queueRoot, trimmed));
}

export function isValidManifest(obj: unknown): obj is PythonManifest {
  if (!obj || typeof obj !== "object") return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.title === "string" &&
    m.title.trim().length > 0 &&
    typeof m.description === "string" &&
    typeof m.videoPath === "string" &&
    m.videoPath.trim().length > 0
  );
}

/** Parse manifest JSON object (Dropbox download or tests). */
export function parseManifestJson(data: unknown): PythonManifest | null {
  if (!isValidManifest(data)) return null;
  return data;
}

export function parseManifestFile(manifestPath: string): PythonManifest | null {
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const data = JSON.parse(raw) as unknown;
    const parsed = parseManifestJson(data);
    if (!parsed) {
      console.error(
        `[PYTHON-QUEUE] Invalid manifest (need title, description, videoPath): ${manifestPath}`,
      );
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`[PYTHON-QUEUE] Failed to parse ${manifestPath}:`, e);
    return null;
  }
}

/**
 * List .json files in manifests/, parse, sort by priority descending, then manifest path.
 */
export function listPendingManifestsSorted(): ParsedManifestEntry[] {
  const root = getQueueRoot();
  if (!root) return [];

  const dir = manifestsDir(root);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries: ParsedManifestEntry[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    console.error("[PYTHON-QUEUE] Cannot read manifests dir:", e);
    return [];
  }

  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const manifestPath = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(manifestPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const manifest = parseManifestFile(manifestPath);
    if (!manifest) continue;

    const priority =
      typeof manifest.priority === "number" && !Number.isNaN(manifest.priority)
        ? manifest.priority
        : 0;

    entries.push({ manifestPath, manifest, priority });
  }

  entries.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.manifestPath.localeCompare(b.manifestPath);
  });

  return entries;
}

export function manifestId(manifest: PythonManifest, manifestPath: string): string {
  if (manifest.id?.trim()) return manifest.id.trim();
  return path.basename(manifestPath, ".json");
}

/** Max manifests processed per worker tick (same default as worker.ts). */
export function getPythonMaxPerTick(): number {
  return Math.max(
    1,
    parseInt(process.env.PYTHON_QUEUE_MAX_PER_TICK || "1", 10) || 1,
  );
}

export interface PythonQueueUiItem {
  id: string;
  title: string;
  priority: number;
  locked: boolean;
  videoReady: boolean;
  fileName: string;
}

export interface PythonQueueUiSummary {
  enabled: boolean;
  /** Last path segment of PYTHON_QUEUE_ROOT (no full path) */
  queueRootLabel?: string;
  maxPerTick: number;
  skipDuplicateTitles: boolean;
  /** True if PYTHON_SESSION_ID is set (manifests can still override per file) */
  sessionIdEnvConfigured: boolean;
  pending: PythonQueueUiItem[];
  failedCount: number;
  processedCount: number;
}

function countJsonFilesInDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

/**
 * Snapshot for dashboard /api/python-queue (read-only).
 */
export function getPythonQueueUiSummary(): PythonQueueUiSummary {
  const maxPerTick = getPythonMaxPerTick();
  const skipDup =
    process.env.PYTHON_SKIP_DUPLICATE_TITLES === "true";
  const sessionIdEnvConfigured = !!process.env.PYTHON_SESSION_ID?.trim();

  const root = getQueueRoot();
  if (!root) {
    return {
      enabled: false,
      maxPerTick,
      skipDuplicateTitles: skipDup,
      sessionIdEnvConfigured,
      pending: [],
      failedCount: 0,
      processedCount: 0,
    };
  }

  const pendingEntries = listPendingManifestsSorted();
  const pending: PythonQueueUiItem[] = pendingEntries.map((e) => {
    const id = manifestId(e.manifest, e.manifestPath);
    const videoAbs = resolveUnderQueueRoot(root, e.manifest.videoPath);
    const locked = fs.existsSync(`${e.manifestPath}.lock`);
    return {
      id,
      title: e.manifest.title,
      priority: e.priority,
      locked,
      videoReady: !!videoAbs && fs.existsSync(videoAbs),
      fileName: path.basename(e.manifestPath),
    };
  });

  return {
    enabled: true,
    queueRootLabel: path.basename(path.resolve(root)),
    maxPerTick,
    skipDuplicateTitles: skipDup,
    sessionIdEnvConfigured,
    pending,
    failedCount: countJsonFilesInDir(failedDir(root)),
    processedCount: countJsonFilesInDir(processedDir(root)),
  };
}
