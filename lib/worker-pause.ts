/**
 * Optional pause flag so the dashboard can stop/resume worker processing
 * without killing the worker process (PM2 keeps it alive; ticks become no-ops).
 */

import fs from "fs";
import path from "path";

const PAUSE_FLAG = path.join(process.cwd(), "data", ".worker-paused");

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
