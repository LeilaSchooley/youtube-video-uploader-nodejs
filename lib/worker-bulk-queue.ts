import { getBulkQueue, type BulkUploadItem } from "./bulk-queue";

/**
 * Get next job that needs processing (pending or processing with more batches)
 */
export function getNextBulkJobToProcess(): { id: string; status: string } | null {
  const queue = getBulkQueue();
  const now = new Date();
  // Use UTC for day calculations (consistent with processBulkJob)
  const today = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  for (const job of queue) {
    if (job.status === "pending") {
      return { id: job.id, status: job.status };
    }

    // Check "processing" jobs that might have more batches for today
    if (
      job.status === "processing" &&
      job.videosPerDay &&
      job.videosPerDay > 0
    ) {
      const startDateRaw = job.startDate
        ? new Date(job.startDate)
        : new Date(job.createdAt);
      const startDate = new Date(
        Date.UTC(
          startDateRaw.getUTCFullYear(),
          startDateRaw.getUTCMonth(),
          startDateRaw.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );

      const daysSinceStart = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate today's batch range
      const todayStartIndex = daysSinceStart * job.videosPerDay;
      const todayEndIndex = Math.min(
        todayStartIndex + job.videosPerDay,
        job.items.length,
      );

      // Check if there are unprocessed videos in today's batch
      const completedIndices = new Set<number>();
      const failedIndices = new Set<number>();
      (job.progress || []).forEach((p: BulkUploadItem["progress"][number]) => {
        if (p && typeof p.index === "number") {
          if (
            p.videoId ||
            (p.status &&
              (p.status.includes("Uploaded") || p.status.includes("Scheduled")))
          ) {
            completedIndices.add(p.index);
          } else if (p.status && p.status.includes("Failed")) {
            failedIndices.add(p.index);
          }
        }
      });

      let hasPendingToday = false;
      for (
        let i = todayStartIndex;
        i < todayEndIndex && i < job.items.length;
        i++
      ) {
        if (!completedIndices.has(i) && !failedIndices.has(i)) {
          hasPendingToday = true;
          break;
        }
      }

      if (hasPendingToday) {
        return { id: job.id, status: job.status };
      }
    }
  }

  return null;
}
