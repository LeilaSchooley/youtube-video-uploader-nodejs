import { isProgressFailure, isProgressProcessing, isProgressSuccess } from "./job-progress-status";
import type { ProgressItem } from "./queue-job-detail-types";
import type { BulkJob, JobStatus } from "./types";

export type RemainingRow = {
  index: number;
  title: string;
  status: string;
};

export function getSelectedJob(
  selectedJobId: string | null,
  queue: BulkJob[],
  jobStatus: JobStatus,
) {
  if (!selectedJobId) return null;
  return (
    (jobStatus?.id === selectedJobId ? jobStatus : null) ||
    queue.find((job) => job.id === selectedJobId) ||
    null
  );
}

export function getProgressStats(progress: ProgressItem[], totalVideos: number) {
  const completed = progress.filter((p) => p && isProgressSuccess(p)).length;
  const failed = progress.filter((p) => p && isProgressFailure(p)).length;
  const processing = progress.filter((p) => p && isProgressProcessing(p)).length;
  const pending = totalVideos - completed - failed - processing;
  const progressPercentage =
    totalVideos > 0 ? Math.round((completed / totalVideos) * 100) : 0;

  return { completed, failed, processing, pending, progressPercentage };
}

export function getCurrentProcessingItem(progress: ProgressItem[]) {
  return progress.find((p) => p && isProgressProcessing(p)) || null;
}

export function getRemainingRows(
  totalVideos: number,
  progress: ProgressItem[],
  items: unknown[] | undefined,
) {
  const rows: RemainingRow[] = [];
  for (let index = 0; index < totalVideos; index++) {
    const progressItem = progress.find((p) => p && p.index === index);
    if (isProgressSuccess(progressItem) || isProgressFailure(progressItem)) {
      continue;
    }

    const jobItem = Array.isArray(items) && items[index] ? items[index] : null;
    const itemTitle =
      jobItem &&
      typeof jobItem === "object" &&
      "title" in jobItem &&
      typeof (jobItem as { title?: unknown }).title === "string"
        ? (jobItem as { title: string }).title
        : null;

    rows.push({
      index,
      title: itemTitle || progressItem?.title || `Video ${index + 1}`,
      status: progressItem?.status || "Pending",
    });
  }
  return rows;
}
