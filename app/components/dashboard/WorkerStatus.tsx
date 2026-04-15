"use client";

import { useState, useEffect } from "react";

interface WorkerStatusProps {
  queue: import("./types").BulkJob[];
  /** When true, any user has a job in "processing" — show Worker Running even if this user's queue has none */
  workerBusy?: boolean;
  /** Worker heartbeat from server; used to show "last seen X min ago" when stale */
  workerHeartbeat?: { lastRunAt: string; jobId?: string } | null;
  /** Pending manifests from GET /api/python-queue (local PYTHON_QUEUE_ROOT and/or Dropbox queue) */
  pythonPendingCount?: number;
}

function formatTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function WorkerStatus({
  queue,
  workerBusy,
  workerHeartbeat,
  pythonPendingCount = 0,
}: WorkerStatusProps) {
  const [workerRunning, setWorkerRunning] = useState<boolean | null>(null);
  const [pendingJobs, setPendingJobs] = useState(0);

  useEffect(() => {
    const checkWorkerStatus = async () => {
      const bulkPending = queue.filter(
        (j) => j.status === "pending" || j.status === "processing"
      ).length;
      const totalPending = bulkPending + pythonPendingCount;
      setPendingJobs(totalPending);

      const hasProcessing = queue.some((j) => j.status === "processing");
      const allPending = queue.filter((j) => j.status === "pending");
      const heartbeatAge = workerHeartbeat
        ? Date.now() - new Date(workerHeartbeat.lastRunAt).getTime()
        : Infinity;

      if (hasProcessing || workerBusy) {
        setWorkerRunning(true);
      } else if (allPending.length > 0) {
        const oldPending = allPending.filter((job) => {
          const age = Date.now() - new Date(job.createdAt).getTime();
          return age > 10000;
        });
        setWorkerRunning(oldPending.length === 0);
      } else if (pythonPendingCount > 0) {
        // No bulk jobs: infer liveness from heartbeat recency (worker ticks every ~5s)
        setWorkerRunning(heartbeatAge < 45000);
      } else {
        setWorkerRunning(null);
      }
    };

    checkWorkerStatus();
    const interval = setInterval(checkWorkerStatus, 2000);
    return () => clearInterval(interval);
  }, [queue, workerBusy, workerHeartbeat, pythonPendingCount]);

  if (workerRunning === null || pendingJobs === 0) {
    return null;
  }

  if (!workerRunning && pendingJobs > 0) {
    return (
      <div className="mb-6 p-4 bg-gradient-to-r from-red-500 to-orange-600 rounded-xl shadow-lg text-white animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">⚠️</div>
            <div>
              <div className="font-bold text-lg mb-1">
                Worker Not Running
              </div>
              <div className="text-sm opacity-90">
                {pendingJobs} job{pendingJobs !== 1 ? "s" : ""} waiting (bulk + Python
                manifests). Start the worker to begin uploading.
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-75 mb-2">Run in terminal:</div>
            <code className="bg-white/20 px-3 py-1 rounded text-sm font-mono">
              npm run worker
            </code>
          </div>
        </div>
      </div>
    );
  }

  const heartbeatStale =
    workerHeartbeat &&
    Date.now() - new Date(workerHeartbeat.lastRunAt).getTime() > 2 * 60 * 1000; // 2 min

  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg text-white">
      <div className="flex items-center gap-3">
        <div className="text-3xl animate-pulse-slow">✅</div>
        <div>
          <div className="font-bold text-lg mb-1">Worker Running</div>
          <div className="text-sm opacity-90">
            Processing {pendingJobs} job{pendingJobs !== 1 ? "s" : ""}
            {workerHeartbeat?.jobId && (
              <span className="ml-2 opacity-75">
                (job {workerHeartbeat.jobId.slice(-8)})
              </span>
            )}
          </div>
          {heartbeatStale && workerHeartbeat && (
            <div className="text-xs opacity-75 mt-1">
              Last activity: {formatTimeAgo(workerHeartbeat.lastRunAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
