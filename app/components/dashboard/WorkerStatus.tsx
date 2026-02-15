"use client";

import { useState, useEffect } from "react";

interface WorkerStatusProps {
  queue: import("./types").BulkJob[];
}

export default function WorkerStatus({ queue }: WorkerStatusProps) {
  const [workerRunning, setWorkerRunning] = useState<boolean | null>(null);
  const [pendingJobs, setPendingJobs] = useState(0);

  useEffect(() => {
    const checkWorkerStatus = async () => {
      // Count pending jobs
      const pending = queue.filter(
        (j) => j.status === "pending" || j.status === "processing"
      ).length;
      setPendingJobs(pending);

      // Check if worker is running by looking for processing jobs
      // If jobs are stuck in pending for too long, worker might not be running
      const hasProcessing = queue.some((j) => j.status === "processing");
      const allPending = queue.filter((j) => j.status === "pending");
      
      if (hasProcessing) {
        setWorkerRunning(true);
      } else if (allPending.length > 0) {
        // Check if pending jobs are old (more than 10 seconds)
        const oldPending = allPending.filter((job) => {
          const age = Date.now() - new Date(job.createdAt).getTime();
          return age > 10000; // 10 seconds
        });
        setWorkerRunning(oldPending.length === 0);
      } else {
        setWorkerRunning(null); // No jobs, can't tell
      }
    };

    checkWorkerStatus();
    const interval = setInterval(checkWorkerStatus, 2000);
    return () => clearInterval(interval);
  }, [queue]);

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
                {pendingJobs} job{pendingJobs !== 1 ? "s" : ""} waiting to be processed. 
                Start the worker to begin uploading.
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

  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg text-white">
      <div className="flex items-center gap-3">
        <div className="text-3xl animate-pulse-slow">✅</div>
        <div>
          <div className="font-bold text-lg mb-1">
            Worker Running
          </div>
          <div className="text-sm opacity-90">
            Processing {pendingJobs} job{pendingJobs !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
