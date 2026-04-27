#!/usr/bin/env node

/**
 * Background worker for processing bulk uploads and optional Python manifest files.
 * Bulk jobs: data/bulk-queue.json. Python bot: local PYTHON_QUEUE_ROOT/manifests and/or per-session Dropbox queue roots.
 */

import { writeHeartbeat } from "./lib/worker-health";
import { isWorkerPaused } from "./lib/worker-pause";
import { workerLog } from "./lib/worker-logger";
import { runWorkerBulkJob } from "./lib/worker-bulk-job";
import { getNextBulkJobToProcess } from "./lib/worker-bulk-queue";
import { processPythonManifestJobs } from "./lib/worker-python-manifests";

const WORKER_INTERVAL = 5000; // Check for new jobs every 5 seconds
const BATCH_SIZE = 3; // Process 3 videos at a time

/**
 * Main worker loop
 */
async function workerLoop(): Promise<void> {
  let jobId: string | undefined;
  try {
    if (isWorkerPaused()) {
      workerLog.info(
        "Worker globally paused (data/.worker-paused); skipping uploads this tick",
      );
      writeHeartbeat("paused");
    } else {
      const pythonHeartbeat = await processPythonManifestJobs();
      const jobToProcess = getNextBulkJobToProcess();
      jobId = jobToProcess?.id ?? pythonHeartbeat;
      writeHeartbeat(jobId);
      if (jobToProcess) {
        await runWorkerBulkJob(jobToProcess.id, BATCH_SIZE);
      }
    }
  } catch (error: unknown) {
    workerLog.error("Error in worker loop", {
      error: error instanceof Error ? error.message : String(error),
      jobId,
    });
  }

  setTimeout(workerLoop, WORKER_INTERVAL);
}

// Start worker
workerLog.info("Starting bulk upload worker", {
  intervalSeconds: WORKER_INTERVAL / 1000,
});
workerLoop();

process.on("SIGINT", () => {
  workerLog.info("Shutting down gracefully (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", () => {
  workerLog.info("Shutting down gracefully (SIGTERM)");
  process.exit(0);
});
