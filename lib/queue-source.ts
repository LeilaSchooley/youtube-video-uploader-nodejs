/**
 * Per-session persisted queue source (Dropbox Python bot layout vs none).
 * Stored at data/queue-source-config.json
 */

import fs from "fs";
import path from "path";

export type QueueSourceType = "none" | "dropbox_python_queue";

export interface QueueSourceRecord {
  sourceType: QueueSourceType;
  /** Normalized Dropbox path (e.g. /Videos/bot-queue) */
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

export function getQueueSourceForSession(
  sessionId: string,
): QueueSourceRecord | null {
  const { bySessionId } = readFile();
  const rec = bySessionId[sessionId];
  if (!rec || rec.sourceType === "none") return null;
  if (!rec.rootPath?.trim()) return null;
  return {
    ...rec,
    rootPath: normalizeDropboxPath(rec.rootPath),
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
    shape.bySessionId[sessionId] = {
      sourceType: record.sourceType,
      rootPath: normalizeDropboxPath(record.rootPath),
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
  const out: Array<{ sessionId: string; rootPath: string }> = [];
  for (const [sessionId, rec] of Object.entries(bySessionId)) {
    if (rec.sourceType === "dropbox_python_queue" && rec.rootPath?.trim()) {
      out.push({
        sessionId,
        rootPath: normalizeDropboxPath(rec.rootPath),
      });
    }
  }
  return out;
}
