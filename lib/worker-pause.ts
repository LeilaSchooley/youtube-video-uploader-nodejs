/**
 * Optional pause flag so the dashboard can stop/resume worker processing
 * without killing the worker process (PM2 keeps it alive; ticks become no-ops).
 */

import fs from "fs";
import path from "path";

const PAUSE_FLAG = path.join(process.cwd(), "data", ".worker-paused");
const SESSION_PAUSE_FILE = path.join(
  process.cwd(),
  "data",
  "worker-paused-sessions.json",
);

interface SessionPauseShape {
  bySessionId: Record<string, string>;
}

function ensureDataDir(): void {
  const dir = path.dirname(PAUSE_FLAG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function isWorkerPaused(): boolean {
  try {
    return fs.existsSync(PAUSE_FLAG);
  } catch {
    return false;
  }
}

function readSessionPauseFile(): SessionPauseShape {
  try {
    if (!fs.existsSync(SESSION_PAUSE_FILE)) return { bySessionId: {} };
    const raw = fs.readFileSync(SESSION_PAUSE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { bySessionId: {} };
    const bySessionId = (parsed as SessionPauseShape).bySessionId;
    if (!bySessionId || typeof bySessionId !== "object") {
      return { bySessionId: {} };
    }
    return { bySessionId };
  } catch {
    return { bySessionId: {} };
  }
}

function writeSessionPauseFile(shape: SessionPauseShape): void {
  ensureDataDir();
  fs.writeFileSync(SESSION_PAUSE_FILE, JSON.stringify(shape, null, 2), "utf8");
}

export function isWorkerPausedForSession(sessionId: string): boolean {
  const id = sessionId.trim();
  if (!id) return false;
  const shape = readSessionPauseFile();
  return typeof shape.bySessionId[id] === "string";
}

export function setWorkerPausedForSession(
  sessionId: string,
  paused: boolean,
): void {
  const id = sessionId.trim();
  if (!id) return;
  const shape = readSessionPauseFile();
  if (paused) {
    shape.bySessionId[id] = new Date().toISOString();
  } else {
    delete shape.bySessionId[id];
  }
  writeSessionPauseFile(shape);
}

export function getPausedWorkerSessionIds(): Set<string> {
  const shape = readSessionPauseFile();
  return new Set(Object.keys(shape.bySessionId));
}

/** Pause: worker skips Python + bulk work each tick until cleared. */
export function setWorkerPaused(paused: boolean): void {
  ensureDataDir();
  if (paused) {
    fs.writeFileSync(PAUSE_FLAG, new Date().toISOString(), "utf8");
  } else {
    try {
      if (fs.existsSync(PAUSE_FLAG)) {
        fs.unlinkSync(PAUSE_FLAG);
      }
    } catch {
      // ignore
    }
  }
}
