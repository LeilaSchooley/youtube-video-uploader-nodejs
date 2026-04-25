/**
 * Persistent list of all videos ever uploaded (across all jobs).
 * Appended by the worker on each successful upload; used for history and optional duplicate check.
 */

import fs from "fs";
import path from "path";
import { getBulkQueue } from "./bulk-queue";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADED_VIDEOS_FILE = path.join(DATA_DIR, "uploaded-videos.json");

export interface UploadedVideoRecord {
  videoId: string;
  title: string;
  jobId: string;
  uploadedAt: string; // ISO
  /** YouTube channel that received the upload (from API). Omitted on older rows. */
  channelId?: string;
  /** Video type (short, montage, review, etc.). For Shorts tracking. */
  videoType?: string;
  /** True if uploaded as a YouTube Short. For Shorts tracking. */
  isShort?: boolean;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readRecords(): UploadedVideoRecord[] {
  try {
    ensureDataDir();
    if (fs.existsSync(UPLOADED_VIDEOS_FILE)) {
      const data = fs.readFileSync(UPLOADED_VIDEOS_FILE, "utf8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error("[UPLOADED-VIDEOS] Error reading file:", error);
  }
  return [];
}

function writeRecords(records: UploadedVideoRecord[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(
      UPLOADED_VIDEOS_FILE,
      JSON.stringify(records, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("[UPLOADED-VIDEOS] Error writing file:", error);
  }
}

/**
 * Append a successful upload. Dedupes by videoId (keeps latest record per videoId).
 */
export function appendUploadedVideo(record: UploadedVideoRecord): void {
  const list = readRecords();
  const without = list.filter((r) => r.videoId !== record.videoId);
  without.push(record);
  writeRecords(without);
}

export type GetUploadedVideosOptions = {
  /** If set, only rows for this YouTube channel (excludes legacy rows with no channelId). */
  channelId?: string | null;
};

/**
 * Return uploaded video records (newest first).
 */
export function getUploadedVideos(
  options?: GetUploadedVideosOptions,
): UploadedVideoRecord[] {
  let list = readRecords();
  const cid = options?.channelId?.trim();
  if (cid) {
    list = list.filter((r) => r.channelId === cid);
  }
  list.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
  return list;
}

/**
 * Clear the uploaded-videos list (e.g. to start fresh). Does not affect videos on YouTube.
 */
export function clearUploadedVideos(): void {
  writeRecords([]);
}

/**
 * Return set of titles (lowercase) that have been uploaded. For duplicate check without API.
 */
export function getUploadedTitlesSet(): Set<string> {
  const list = readRecords();
  const set = new Set<string>();
  for (const r of list) {
    if (r.title && r.title.trim()) {
      set.add(r.title.toLowerCase().trim());
    }
  }
  return set;
}

const PYTHON_MANIFEST_JOB_PREFIX = "python-manifest:";

/**
 * Count uploads recorded today (UTC midnight) whose jobId came from the Python manifest worker.
 * Only counts records with a non-empty videoId (i.e. actually succeeded on YouTube).
 */
export function countPythonManifestUploadsTodayUtc(): number {
  const list = readRecords();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const minTime = start.getTime();
  let n = 0;
  for (const r of list) {
    if (!r.jobId.startsWith(PYTHON_MANIFEST_JOB_PREFIX)) continue;
    if (!r.videoId) continue;
    const t = new Date(r.uploadedAt).getTime();
    if (t >= minTime) n++;
  }
  return n;
}

/**
 * True if a Python manifest job with the given jobId has already been recorded
 * as uploaded today (UTC). Used to prevent double-uploading the same manifest
 * if the post-upload file move fails or the daily cap toggle is off.
 */
export function wasManifestJobUploadedTodayUtc(jobId: string): boolean {
  const list = readRecords();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const minTime = start.getTime();
  for (const r of list) {
    if (r.jobId !== jobId) continue;
    if (!r.videoId) continue;
    const t = new Date(r.uploadedAt).getTime();
    if (t >= minTime) return true;
  }
  return false;
}

/**
 * Backfill uploaded-videos.json from existing bulk queue jobs.
 * Adds any progress entry that has a videoId and is not already in the list (deduped by videoId).
 * Does not overwrite existing records.
 * @returns number of new records added
 */
export function backfillFromBulkQueue(): number {
  const queue = getBulkQueue();
  const existing = readRecords();
  const byVideoId = new Map<string, UploadedVideoRecord>();
  for (const r of existing) {
    byVideoId.set(r.videoId, r);
  }
  let added = 0;
  for (const job of queue) {
    const progress = job.progress || [];
    const items = job.items || [];
    for (const p of progress) {
      if (!p?.videoId) continue;
      if (byVideoId.has(p.videoId)) continue;
      const title =
        p.title ||
        items[p.index]?.title ||
        (items[p.index] as { video_name?: string })?.video_name ||
        `Video ${p.index + 1}`;
      const record: UploadedVideoRecord = {
        videoId: p.videoId,
        title: String(title ?? ""),
        jobId: job.id,
        uploadedAt: job.updatedAt || job.createdAt || new Date().toISOString(),
      };
      byVideoId.set(p.videoId, record);
      added++;
    }
  }
  if (added > 0) {
    writeRecords(Array.from(byVideoId.values()));
  }
  return added;
}

/**
 * Count Shorts uploads recorded today (UTC midnight) from the Python manifest worker.
 */
export function countPythonManifestShortsUploadedTodayUtc(): number {
  const list = readRecords();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const minTime = start.getTime();
  let n = 0;
  for (const r of list) {
    if (!r.jobId.startsWith(PYTHON_MANIFEST_JOB_PREFIX)) continue;
    if (!r.videoId) continue;
    if (!r.isShort) continue;
    const t = new Date(r.uploadedAt).getTime();
    if (t >= minTime) n++;
  }
  return n;
}
