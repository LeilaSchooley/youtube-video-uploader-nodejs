/**
 * Per-session persisted queue source (Dropbox Python bot layout vs none).
 * Stored at data/queue-source-config.json
 */

import fs from "fs";
import path from "path";

export type QueueSourceType =
  | "none"
  | "dropbox_python_queue"
  | "drive_python_queue";

export interface QueueSourceRecord {
  sourceType: QueueSourceType;
  /** Dropbox path (e.g. /Videos/bot-queue) or Drive folder ID */
  rootPath: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "queue-source-config.json");

interface FileShape {
  bySessionId: Record<string, QueueSourceRecord>;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFile(): FileShape {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { bySessionId: {} };
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return { bySessionId: {} };
    const bySessionId = (data as FileShape).bySessionId;
    if (!bySessionId || typeof bySessionId !== "object")
      return { bySessionId: {} };
    return { bySessionId };
  } catch {
    return { bySessionId: {} };
  }
}

function writeFile(shape: FileShape): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(shape, null, 2), "utf8");
}

export function normalizeDropboxPath(p: string): string {
  const t = (p || "").trim();
  if (!t) return "/";
  let s = t.startsWith("/") ? t : `/${t}`;
  s = s.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return s;
}

export function normalizeDriveFolderId(p: string): string {
  return (p || "").trim();
}

function normalizeRootForSource(
  sourceType: QueueSourceType,
  rootPath: string,
): string {
  if (sourceType === "dropbox_python_queue") {
    return normalizeDropboxPath(rootPath);
  }
  return normalizeDriveFolderId(rootPath);
}

export function getQueueSourceForSession(
  sessionId: string,
): QueueSourceRecord | null {
  const { bySessionId } = readFile();
  const rec = bySessionId[sessionId];
  if (!rec || rec.sourceType === "none") return null;
  if (!rec.rootPath?.trim()) return null;
  return {
    ...rec,
    rootPath: normalizeRootForSource(rec.sourceType, rec.rootPath),
  };
}

export function setQueueSourceForSession(
  sessionId: string,
  record: QueueSourceRecord,
): void {
  const shape = readFile();
  if (record.sourceType === "none") {
    delete shape.bySessionId[sessionId];
  } else {
    const normalizedRoot = normalizeRootForSource(
      record.sourceType,
      record.rootPath,
    );
    for (const [otherSessionId, other] of Object.entries(shape.bySessionId)) {
      if (otherSessionId === sessionId) continue;
      if (other.sourceType !== record.sourceType) continue;
      const otherRoot = normalizeRootForSource(other.sourceType, other.rootPath);
      const sameRoot =
        record.sourceType === "dropbox_python_queue"
          ? otherRoot.toLowerCase() === normalizedRoot.toLowerCase()
          : otherRoot === normalizedRoot;
      if (!sameRoot) continue;
      delete shape.bySessionId[otherSessionId];
    }
    shape.bySessionId[sessionId] = {
      sourceType: record.sourceType,
      rootPath: normalizedRoot,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
  }
  writeFile(shape);
}

export function getAllDropboxPythonQueueSessions(): Array<{
  sessionId: string;
  rootPath: string;
}> {
  const { bySessionId } = readFile();
  const out: Array<{ sessionId: string; rootPath: string; updatedAt: string }> = [];
  for (const [sessionId, rec] of Object.entries(bySessionId)) {
    if (rec.sourceType === "dropbox_python_queue" && rec.rootPath?.trim()) {
      out.push({
        sessionId,
        rootPath: normalizeDropboxPath(rec.rootPath),
        updatedAt:
          typeof rec.updatedAt === "string" && rec.updatedAt.trim()
            ? rec.updatedAt
            : "1970-01-01T00:00:00.000Z",
      });
    }
  }
  /** One worker pass per queue root — keep most recently updated session when duplicates exist. */
  const byRoot = new Map<string, (typeof out)[number]>();
  for (const row of out) {
    const key = row.rootPath.toLowerCase();
    const prev = byRoot.get(key);
    if (!prev) {
      byRoot.set(key, row);
      continue;
    }
    const rowTime = Date.parse(row.updatedAt);
    const prevTime = Date.parse(prev.updatedAt);
    if (!Number.isNaN(rowTime) && Number.isNaN(prevTime)) {
      byRoot.set(key, row);
      continue;
    }
    if (!Number.isNaN(rowTime) && !Number.isNaN(prevTime) && rowTime >= prevTime) {
      byRoot.set(key, row);
    }
  }
  return Array.from(byRoot.values()).map(({ sessionId, rootPath }) => ({
    sessionId,
    rootPath,
  }));
}

export function getAllDrivePythonQueueSessions(): Array<{
  sessionId: string;
  rootPath: string;
}> {
  const { bySessionId } = readFile();
  const out: Array<{ sessionId: string; rootPath: string; updatedAt: string }> =
    [];
  for (const [sessionId, rec] of Object.entries(bySessionId)) {
    if (rec.sourceType === "drive_python_queue" && rec.rootPath?.trim()) {
      out.push({
        sessionId,
        rootPath: normalizeDriveFolderId(rec.rootPath),
        updatedAt:
          typeof rec.updatedAt === "string" && rec.updatedAt.trim()
            ? rec.updatedAt
            : "1970-01-01T00:00:00.000Z",
      });
    }
  }
  const byRoot = new Map<string, (typeof out)[number]>();
  for (const row of out) {
    const key = row.rootPath;
    const prev = byRoot.get(key);
    if (!prev) {
      byRoot.set(key, row);
      continue;
    }
    const rowTime = Date.parse(row.updatedAt);
    const prevTime = Date.parse(prev.updatedAt);
    if (!Number.isNaN(rowTime) && Number.isNaN(prevTime)) {
      byRoot.set(key, row);
      continue;
    }
    if (
      !Number.isNaN(rowTime) &&
      !Number.isNaN(prevTime) &&
      rowTime >= prevTime
    ) {
      byRoot.set(key, row);
    }
  }
  return Array.from(byRoot.values()).map(({ sessionId, rootPath }) => ({
    sessionId,
    rootPath,
  }));
}

export function isPythonManifestQueueSource(
  sourceType: QueueSourceType | undefined,
): boolean {
  return (
    sourceType === "dropbox_python_queue" ||
    sourceType === "drive_python_queue"
  );
}
