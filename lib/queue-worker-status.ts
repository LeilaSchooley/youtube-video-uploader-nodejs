/**
 * Dashboard snapshot for GET /api/queue-worker/status
 */

import type { PythonQueueData } from "@/app/components/dashboard/types";
import { getBulkQueue } from "./bulk-queue";
import type { BulkUploadItem } from "./bulk-queue";
import { getPythonQueueUiSummary } from "./python-queue";
import { readHeartbeat } from "./worker-health";
import { isWorkerPaused } from "./worker-pause";

function userOwnsBulkJob(
  job: BulkUploadItem,
  sessionId: string,
  userId?: string,
): boolean {
  return job.sessionId === sessionId || (!!userId && job.userId === userId);
}

export interface QueueWorkerStatusPayload {
  paused: boolean;
  heartbeat: { lastRunAt: string; jobId?: string } | null;
  /** Combined manifest + bulk queue (this session) */
  counts: {
    queued: number;
    uploading: number;
    done: number;
    failed: number;
  };
  python: {
    enabled: boolean;
    pending: number;
    locked: number;
    processedOnDisk: number;
    failedOnDisk: number;
    /** Pending manifests whose video file is present (uploadable when worker runs) */
    videosReady: number;
    /** Pending manifests still waiting on the video file */
    videosMissing: number;
  };
  bulk: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

export function getQueueWorkerStatus(
  sessionId: string,
  userId?: string,
  /** When set (e.g. from async Dropbox-aware summary), use instead of disk-only python summary */
  pythonSummaryOverride?: PythonQueueData | null,
): QueueWorkerStatusPayload {
  const paused = isWorkerPaused();
  const heartbeat = readHeartbeat();
  const fsPy = getPythonQueueUiSummary();
  const py: PythonQueueData = pythonSummaryOverride ?? {
    ...fsPy,
    uploadsTodayUtc: 0,
  };
  const bulkAll = getBulkQueue();
  const bulk = bulkAll.filter((j) => userOwnsBulkJob(j, sessionId, userId));

  const bulkPending = bulk.filter((j) => j.status === "pending").length;
  const bulkProcessing = bulk.filter((j) => j.status === "processing").length;
  const bulkCompleted = bulk.filter((j) => j.status === "completed").length;
  const bulkFailed = bulk.filter((j) => j.status === "failed").length;

  const pythonPending = py.enabled ? py.pending.length : 0;
  const pythonLocked = py.enabled
    ? py.pending.filter((p) => p.locked).length
    : 0;
  const pythonVideosReady = py.enabled
    ? py.pending.filter((p) => p.videoReady).length
    : 0;
  const pythonVideosMissing = py.enabled
    ? py.pending.filter((p) => !p.videoReady).length
    : 0;

  const heartbeatPython =
    heartbeat?.jobId?.startsWith("python:") === true ? 1 : 0;
  const pythonUploading = Math.max(pythonLocked, heartbeatPython);

  const queued = pythonPending + bulkPending;
  const uploading = bulkProcessing + pythonUploading;
  const done = (py.enabled ? py.processedCount : 0) + bulkCompleted;
  const failed = (py.enabled ? py.failedCount : 0) + bulkFailed;

  return {
    paused,
    heartbeat: heartbeat
      ? {
          lastRunAt: heartbeat.lastRunAt,
          jobId: heartbeat.jobId,
        }
      : null,
    counts: { queued, uploading, done, failed },
    python: {
      enabled: py.enabled,
      pending: pythonPending,
      locked: pythonLocked,
      processedOnDisk: py.processedCount,
      failedOnDisk: py.failedCount,
      videosReady: pythonVideosReady,
      videosMissing: pythonVideosMissing,
    },
    bulk: {
      pending: bulkPending,
      processing: bulkProcessing,
      completed: bulkCompleted,
      failed: bulkFailed,
    },
  };
}
