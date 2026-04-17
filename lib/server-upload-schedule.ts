/**
 * Global upload schedule persisted for the Node worker (Python manifest queue).
 * Dashboard mirrors the same values from localStorage via POST /api/upload-schedule.
 */

import fs from "fs";
import path from "path";
import { countPythonManifestUploadsTodayUtc } from "@/lib/uploaded-videos";

const DATA_DIR = path.join(process.cwd(), "data");
const SCHEDULE_FILE = path.join(DATA_DIR, "worker-upload-schedule.json");

export interface WorkerUploadScheduleState {
  enabled: boolean;
  /** Non-empty string when set in UI (may be "0") */
  videosPerDay: string;
  updatedAt?: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const defaultState = (): WorkerUploadScheduleState => ({
  enabled: false,
  videosPerDay: "",
});

export function readWorkerUploadSchedule(): WorkerUploadScheduleState {
  try {
    ensureDataDir();
    if (!fs.existsSync(SCHEDULE_FILE)) {
      return defaultState();
    }
    const raw = fs.readFileSync(SCHEDULE_FILE, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const enabled = data.enabled === true;
    const videosPerDay =
      typeof data.videosPerDay === "string" ? data.videosPerDay : "";
    return { enabled, videosPerDay, updatedAt: data.updatedAt as string };
  } catch (e) {
    console.error("[WORKER-UPLOAD-SCHEDULE] read failed:", e);
    return defaultState();
  }
}

export function writeWorkerUploadSchedule(
  enabled: boolean,
  videosPerDay: string,
): WorkerUploadScheduleState {
  const state: WorkerUploadScheduleState = {
    enabled,
    videosPerDay: videosPerDay.trim(),
    updatedAt: new Date().toISOString(),
  };
  try {
    ensureDataDir();
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("[WORKER-UPLOAD-SCHEDULE] write failed:", e);
  }
  return state;
}

/**
 * When non-null, at most this many more Python-manifest uploads may run today (UTC).
 * null means no daily cap (disabled or invalid videosPerDay).
 */
export function getPythonManifestDailySlotsRemaining(): number | null {
  const s = readWorkerUploadSchedule();
  if (!s.enabled) return null;
  const n = parseInt(s.videosPerDay.trim(), 10);
  if (Number.isNaN(n) || n <= 0) return null;
  const used = countPythonManifestUploadsTodayUtc();
  return Math.max(0, n - used);
}
