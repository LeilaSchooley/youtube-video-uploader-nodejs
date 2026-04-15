"use client";

import type { BulkJob, JobStatus } from "./types";

export interface QueueManagementJobListProps {
  queue: BulkJob[];
  searchQuery: string;
  selectedJobId: string | null;
  jobStatus: JobStatus;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  handleQueueAction: (
    jobId: string,
    action:
      | "pause"
      | "resume"
      | "cancel"
      | "delete"
      | "delete-all-jobs"
      | "retry-failed",
  ) => Promise<void>;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
}

export default function QueueManagementJobList({
  queue,
  searchQuery,
  selectedJobId,
  jobStatus,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  handleQueueAction,
  requestConfirm,
}: QueueManagementJobListProps) {
  if (queue.length === 0) return null;

  return (
  <div className="card">
    <div className="flex items-center gap-3 mb-6">
      <span className="text-3xl">📊</span>
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
        Upload History
      </h2>
    </div>

    {/* Simplified Jobs List */}
    <div className="flex flex-col gap-3">
      {queue
        .filter(
          (job) =>
            !searchQuery ||
            job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            job.status.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .slice(0, 10) // Show only first 10 jobs
        .map((job) => {
          // Use jobStatus if available (has full items data), otherwise use job from queue
          const displayJob =
            selectedJobId === job.id && jobStatus ? jobStatus : job;
          // Calculate job progress
          const jobProgress = displayJob.progress || [];
          const completedCount = jobProgress.filter(
            (p: any) =>
              p &&
              (p.videoId ||
                (p.status &&
                  (p.status.includes("Uploaded") ||
                    p.status.includes("Completed") ||
                    p.status.includes("Scheduled") ||
                    p.status.includes("Already uploaded")))),
          ).length;
          const failedCount = jobProgress.filter(
            (p: any) =>
              p &&
              (p.error ||
                (p.status &&
                  (p.status.includes("Failed") ||
                    p.status.includes("Missing") ||
                    p.status.includes("Invalid")))),
          ).length;
          const totalVideos =
            displayJob.totalVideos || jobProgress.length || 0;
          const pendingCount = totalVideos - completedCount - failedCount;

          // Override status if there are pending videos
          const displayStatus =
            pendingCount > 0 && displayJob.status === "completed"
              ? "processing"
              : displayJob.status;

          // Get items from displayJob (prefer jobStatus if available for full data)
          const jobItems = displayJob.items || job.items || [];

          const progressPercent =
            totalVideos > 0
              ? Math.round((completedCount / totalVideos) * 100)
              : 0;

          return (
            <div
              key={job.id}
              className={`p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                selectedJobId === job.id
                  ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-blue-400 dark:border-blue-500 shadow-lg"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md"
              }`}
              onClick={() => {
                setSelectedJobId(job.id);
                // Immediately fetch job status and queue when clicked
                fetchJobStatus(job.id);
                fetchQueue();
              }}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-4 h-4 rounded-full flex-shrink-0 ${
                        displayStatus === "completed"
                          ? "bg-green-500 shadow-lg shadow-green-500/50"
                          : displayStatus === "failed"
                            ? "bg-red-500 shadow-lg shadow-red-500/50"
                            : displayStatus === "processing"
                              ? "bg-yellow-500 animate-pulse shadow-lg shadow-yellow-500/50"
                              : displayStatus === "paused"
                                ? "bg-blue-500 shadow-lg shadow-blue-500/50"
                                : "bg-gray-400"
                      }`}
                    ></div>
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                      {job.id}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                        displayStatus === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : displayStatus === "failed"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : displayStatus === "processing"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 animate-pulse"
                              : displayStatus === "paused"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {displayStatus === "completed" && "✓ "}
                      {displayStatus === "failed" && "✕ "}
                      {displayStatus === "processing" && "⚡ "}
                      {displayStatus === "paused" && "⏸ "}
                      {displayStatus.toUpperCase()}
                    </span>
                    {(job.status === "pending" ||
                      job.status === "processing") &&
                      typeof job.positionAhead === "number" &&
                      job.positionAhead > 0 && (
                        <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-xs text-gray-600 dark:text-gray-300">
                          {job.positionAhead} job
                          {job.positionAhead !== 1 ? "s" : ""} ahead
                        </span>
                      )}
                  </div>

                  {/* Progress Bar */}
                  {totalVideos > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Progress: {completedCount} / {totalVideos}
                        </span>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                          {progressPercent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            displayStatus === "completed"
                              ? "bg-gradient-to-r from-green-500 to-emerald-500"
                              : displayStatus === "failed"
                                ? "bg-gradient-to-r from-red-500 to-pink-500"
                                : displayStatus === "processing"
                                  ? "bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse"
                                  : "bg-gradient-to-r from-blue-500 to-indigo-500"
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      {(completedCount > 0 || failedCount > 0) && (
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {completedCount > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              {completedCount} completed
                            </span>
                          )}
                          {failedCount > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              {failedCount} failed
                            </span>
                          )}
                          {totalVideos - completedCount - failedCount >
                            0 && (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                              {totalVideos - completedCount - failedCount}{" "}
                              pending
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    {job.totalVideos && (
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        📹 {job.totalVideos} video
                        {job.totalVideos !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span>📅</span>
                      <span>
                        Created:{" "}
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Next Batch/Pending Videos Information */}
                    {pendingCount > 0 &&
                      (() => {
                        // Find the next pending video(s) to upload
                        const nextPendingVideos: Array<{
                          index: number;
                          title: string;
                        }> = [];

                        // If videosPerDay is set, find the next batch
                        if (
                          displayJob.videosPerDay &&
                          displayJob.videosPerDay > 0
                        ) {
                          const startDate = displayJob.startDate
                            ? new Date(displayJob.startDate)
                            : new Date(displayJob.createdAt);
                          startDate.setHours(12, 0, 0, 0);

                          // Find the next batch that hasn't been completed yet
                          const currentBatch = Math.floor(
                            completedCount / displayJob.videosPerDay,
                          );
                          let nextBatchStartIndex =
                            currentBatch * displayJob.videosPerDay;

                          // Skip batches that are already completed
                          while (nextBatchStartIndex < totalVideos) {
                            const batchEndIndex = Math.min(
                              nextBatchStartIndex +
                                displayJob.videosPerDay,
                              totalVideos,
                            );
                            // Check if this batch has any uncompleted videos
                            const batchCompleted = jobProgress.filter(
                              (p: any) =>
                                p &&
                                p.index >= nextBatchStartIndex &&
                                p.index < batchEndIndex &&
                                (p.videoId ||
                                  (p.status &&
                                    (p.status.includes("Uploaded") ||
                                      p.status.includes("Completed") ||
                                      p.status.includes("Scheduled") ||
                                      p.status.includes(
                                        "Already uploaded",
                                      )))),
                            ).length;

                            if (
                              batchCompleted <
                              batchEndIndex - nextBatchStartIndex
                            ) {
                              // Found a batch with uncompleted videos
                              break;
                            }
                            nextBatchStartIndex = batchEndIndex;
                          }

                          if (nextBatchStartIndex < totalVideos) {
                            const nextBatchEndIndex = Math.min(
                              nextBatchStartIndex +
                                displayJob.videosPerDay,
                              totalVideos,
                            );

                            // Get video titles for next batch
                            for (
                              let i = nextBatchStartIndex;
                              i < nextBatchEndIndex && i < totalVideos;
                              i++
                            ) {
                              let title = `Video ${i + 1}`;

                              // Try to get title from jobItems (from sheet) - check multiple ways
                              if (
                                jobItems &&
                                Array.isArray(jobItems) &&
                                jobItems.length > i
                              ) {
                                const item = jobItems[i];
                                // Check if item exists and has a valid title
                                if (item && typeof item === "object") {
                                  const itemTitle = item.title;
                                  if (
                                    itemTitle &&
                                    typeof itemTitle === "string" &&
                                    itemTitle.trim() &&
                                    itemTitle.trim() !== `Video ${i + 1}`
                                  ) {
                                    title = itemTitle.trim();
                                  }
                                }
                              }
                              // Fallback to progress title if available (check by array index)
                              if (
                                title === `Video ${i + 1}` &&
                                jobProgress[i] &&
                                jobProgress[i].title
                              ) {
                                title = jobProgress[i].title ?? title;
                              }
                              // Also check progress by index match (more reliable)
                              if (title === `Video ${i + 1}`) {
                                const progressItem = jobProgress.find(
                                  (p: any) => p && p.index === i,
                                );
                                if (progressItem && progressItem.title) {
                                  title = progressItem.title ?? title;
                                }
                              }

                              // Only add if not already completed
                              const isCompleted = jobProgress.some(
                                (p: any) =>
                                  p &&
                                  p.index === i &&
                                  (p.videoId ||
                                    (p.status &&
                                      (p.status.includes("Uploaded") ||
                                        p.status.includes("Completed") ||
                                        p.status.includes("Scheduled") ||
                                        p.status.includes(
                                          "Already uploaded",
                                        )))),
                              );

                              if (!isCompleted) {
                                nextPendingVideos.push({
                                  index: i,
                                  title,
                                });
                              }
                            }

                            const nextBatchDate = new Date(startDate);
                            const batchNumber = Math.floor(
                              nextBatchStartIndex / (job.videosPerDay || 1),
                            );
                            nextBatchDate.setDate(
                              startDate.getDate() + batchNumber,
                            );

                            const now = new Date();
                            const isToday =
                              nextBatchDate.toDateString() ===
                              now.toDateString();
                            const isTomorrow =
                              nextBatchDate.toDateString() ===
                              new Date(
                                now.getTime() + 24 * 60 * 60 * 1000,
                              ).toDateString();

                            if (nextPendingVideos.length > 0) {
                              return (
                                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-semibold text-sm mb-1">
                                    <span>📅</span>
                                    <span>
                                      Next Batch:{" "}
                                      {nextPendingVideos.length} video
                                      {nextPendingVideos.length !== 1
                                        ? "s"
                                        : ""}
                                      {isToday
                                        ? " (Today)"
                                        : isTomorrow
                                          ? " (Tomorrow)"
                                          : ` (${nextBatchDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
                                    </span>
                                  </div>
                                  <div className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-0.5">
                                    {nextPendingVideos
                                      .slice(0, 5)
                                      .map((video, idx) => (
                                        <div
                                          key={idx}
                                          className="truncate"
                                        >
                                          • {video.title}
                                        </div>
                                      ))}
                                    {nextPendingVideos.length > 5 && (
                                      <div className="text-blue-600 dark:text-blue-400">
                                        + {nextPendingVideos.length - 5}{" "}
                                        more...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                          }
                        } else {
                          // No videosPerDay set - show all pending videos
                          for (let i = 0; i < totalVideos; i++) {
                            const isCompleted = jobProgress.some(
                              (p: any) =>
                                p &&
                                p.index === i &&
                                (p.videoId ||
                                  (p.status &&
                                    (p.status.includes("Uploaded") ||
                                      p.status.includes("Completed") ||
                                      p.status.includes("Scheduled") ||
                                      p.status.includes(
                                        "Already uploaded",
                                      )))),
                            );

                            if (!isCompleted) {
                              let title = `Video ${i + 1}`;

                              // Try to get title from jobItems (from sheet) - check multiple ways
                              if (
                                jobItems &&
                                Array.isArray(jobItems) &&
                                jobItems.length > i
                              ) {
                                const item = jobItems[i];
                                // Check if item exists and has a valid title
                                if (item && typeof item === "object") {
                                  const itemTitle = item.title;
                                  if (
                                    itemTitle &&
                                    typeof itemTitle === "string" &&
                                    itemTitle.trim() &&
                                    itemTitle.trim() !== `Video ${i + 1}`
                                  ) {
                                    title = itemTitle.trim();
                                  }
                                }
                              }
                              // Fallback to progress title if available (check by array index)
                              if (
                                title === `Video ${i + 1}` &&
                                jobProgress[i] &&
                                jobProgress[i].title
                              ) {
                                title = jobProgress[i].title ?? title;
                              }
                              // Also check progress by index match (more reliable)
                              if (title === `Video ${i + 1}`) {
                                const progressItem = jobProgress.find(
                                  (p: any) => p && p.index === i,
                                );
                                if (progressItem && progressItem.title) {
                                  title = progressItem.title ?? title;
                                }
                              }

                              nextPendingVideos.push({ index: i, title });

                              // Limit to first 5 for display
                              if (nextPendingVideos.length >= 5) break;
                            }
                          }

                          if (nextPendingVideos.length > 0) {
                            return (
                              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-semibold text-sm mb-1">
                                  <span>⏳</span>
                                  <span>
                                    Next: {nextPendingVideos.length} video
                                    {nextPendingVideos.length !== 1
                                      ? "s"
                                      : ""}{" "}
                                    pending
                                  </span>
                                </div>
                                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-0.5">
                                  {nextPendingVideos.map((video, idx) => (
                                    <div key={idx} className="truncate">
                                      • {video.title}
                                    </div>
                                  ))}
                                  {pendingCount >
                                    nextPendingVideos.length && (
                                    <div className="text-blue-600 dark:text-blue-400">
                                      +{" "}
                                      {pendingCount -
                                        nextPendingVideos.length}{" "}
                                      more...
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        }

                        return null;
                      })()}

                    {displayJob.status === "processing" &&
                      job.progress &&
                      job.progress.length > 0 &&
                      job.progress[0] &&
                      job.progress[0].status &&
                      (job.progress[0].status.includes("Uploading") ||
                        job.progress[0].status === "Pending") && (
                        <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                          <div className="flex items-center gap-2 text-green-800 dark:text-green-200 font-semibold text-sm">
                            <span className="animate-pulse-slow">⚡</span>
                            <span>Uploading first video now...</span>
                          </div>
                        </div>
                      )}
                  </div>
                  {/* Queue Management Actions */}
                  <div className="flex gap-2 mt-4 flex-wrap pt-3 border-t border-gray-200 dark:border-gray-700">
                    {job.status === "pending" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "pause");
                          }}
                          className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ⏸ Pause
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "cancel");
                          }}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ✕ Cancel
                        </button>
                      </>
                    )}
                    {job.status === "paused" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "resume");
                          }}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ▶ Resume
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "cancel");
                          }}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ✕ Cancel
                        </button>
                      </>
                    )}
                    {job.status === "processing" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "pause");
                          }}
                          className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ⏸ Pause
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, "cancel");
                          }}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ✕ Cancel
                        </button>
                      </>
                    )}
                    {(job.status === "completed" ||
                      job.status === "failed" ||
                      job.status === "cancelled") && (
                      <>
                        {failedCount > 0 && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const ok = await requestConfirm({
                                title: "Retry failed",
                                message: `Create a new job with ${failedCount} failed item(s) to retry?`,
                                confirmLabel: "Retry",
                              });
                              if (ok)
                                handleQueueAction(job.id, "retry-failed");
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
                            title="Retry failed items only"
                          >
                            🔄 Retry failed
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await requestConfirm({
                              title: "Delete job",
                              message: `Are you sure you want to delete this ${job.status} job? This will remove it from the queue and clean up associated files.`,
                              confirmLabel: "Delete",
                              variant: "danger",
                            });
                            if (ok) handleQueueAction(job.id, "delete");
                          }}
                          className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          title="Delete this job"
                        >
                          🗑️ Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-2xl text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {selectedJobId === job.id ? "▼" : "▶"}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  </div>
  );
}
