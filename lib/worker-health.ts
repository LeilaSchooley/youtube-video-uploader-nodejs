/**
 * Worker heartbeat: write last-run timestamp to a file so monitors can verify the worker is alive.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const HEARTBEAT_FILE = path.join(DATA_DIR, "worker-heartbeat.json");

export interface WorkerHeartbeat {
  lastRunAt: string; // ISO
  pid: number;
  jobId?: string; // If currently processing
}

export function writeHeartbeat(jobId?: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload: WorkerHeartbeat = {
      lastRunAt: new Date().toISOString(),
      pid: process.pid,
      ...(jobId && { jobId }),
    };
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.warn("[WORKER] Failed to write heartbeat:", err);
  }
}

export function readHeartbeat(): WorkerHeartbeat | null {
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      const raw = fs.readFileSync(HEARTBEAT_FILE, "utf8");
      return JSON.parse(raw) as WorkerHeartbeat;
    }
  } catch {
    // ignore
  }
  return null;
}
