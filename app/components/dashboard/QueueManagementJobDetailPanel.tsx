"use client";

import { useAppToast } from "@/app/app-toast-context";
import type { BulkJob, JobStatus } from "./types";
import {
  formatDuration,
  formatFileSize,
  formatSpeed,
} from "@/lib/queue-formatters";

export interface ProgressItem {
  index: number;
  status: string;
  videoId?: string;
  fileSize?: number;
  duration?: number;
  uploadSpeed?: number;
}

export interface QueueManagementJobDetailPanelProps {
  selectedJobId: string | null;
  queue: BulkJob[];
  jobStatus: JobStatus;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
  isVideoDetailsCollapsed: boolean;
  setIsVideoDetailsCollapsed: (v: boolean) => void;
  isRemainingSheetCollapsed: boolean;
  setIsRemainingSheetCollapsed: (v: boolean) => void;
}

export default function QueueManagementJobDetailPanel({
  selectedJobId,
  queue,
  jobStatus,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  requestConfirm,
  isVideoDetailsCollapsed,
  setIsVideoDetailsCollapsed,
  isRemainingSheetCollapsed,
  setIsRemainingSheetCollapsed,
}: QueueManagementJobDetailPanelProps) {
  const showAppToast = useAppToast();
  if (!selectedJobId) return null;
// Use jobStatus if available, otherwise fall back to queue data to prevent flickering
const selectedJob =
  jobStatus || queue.find((j) => j.id === selectedJobId);
if (!selectedJob) return null;

const progress = selectedJob.progress || [];
const totalVideos = selectedJob.totalVideos || progress.length || 0;
const completed = progress.filter(
  (p: ProgressItem) =>
    p &&
    (p.videoId ||
      (p.status &&
        (p.status.includes("Uploaded") ||
          p.status.includes("Completed") ||
          p.status.includes("Scheduled") ||
          p.status.includes("scheduled") ||
          p.status.includes("Already uploaded")))),
).length;
const failed = progress.filter(
  (p: ProgressItem) =>
    p &&
    p.status &&
    (p.status.includes("Failed") ||
      p.status.includes("Missing") ||
      p.status.includes("Invalid") ||
      p.status.includes("not found") ||
      p.status.includes("Cannot access") ||
      p.status.includes("error")),
).length;
const processing = progress.filter(
  (p: ProgressItem) =>
    p &&
    p.status &&
    (p.status.includes("Uploading") ||
      p.status === "Pending" ||
      p.status.includes("thumbnail") ||
      p.status.includes("Checking")),
).length;
const pending = totalVideos - completed - failed - processing;
const progressPercentage =
  totalVideos > 0 ? Math.round((completed / totalVideos) * 100) : 0;

return (
  <div className="mt-5 p-6 bg-gradient-to-br from-gray-50 dark:from-gray-800 to-blue-50 dark:to-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-lg">
    <div className="flex justify-between items-start mb-6">
      <div className="flex-1">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
          📋 Job Progress
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
          {selectedJob.id}
        </p>
        {selectedJob.notes && (
          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded text-sm text-blue-800 dark:text-blue-200">
            <strong>📝 Notes:</strong> {selectedJob.notes}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            const notes = prompt(
              "Add notes for this job:",
              selectedJob.notes || "",
            );
            if (notes !== null) {
              try {
                const res = await fetch("/api/queue-notes", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    jobId: selectedJob.id,
                    notes,
                  }),
                });
                const data = await res.json();
                if (res.ok) {
                  showAppToast({
                    message: "Notes updated",
                    type: "success",
                  });
                  fetchJobStatus(selectedJob.id);
                } else {
                  showAppToast({
                    message: data.error || "Failed to update notes",
                    type: "error",
                  });
                }
              } catch (error) {
                showAppToast({
                  message: "An error occurred",
                  type: "error",
                });
              }
            }
          }}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Add/edit notes"
        >
          📝 Notes
        </button>
        <button
          onClick={async () => {
            const ok = await requestConfirm({
              title: "Copy job",
              message:
                "Copy this job? This will create a duplicate with the same settings.",
              confirmLabel: "Copy",
            });
            if (ok) {
              try {
                const res = await fetch("/api/queue-copy", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ jobId: selectedJob.id }),
                });
                const data = await res.json();
                if (res.ok) {
                  showAppToast({
                    message: `Job copied! New job ID: ${data.jobId}`,
                    type: "success",
                  });
                  fetchQueue();
                  setSelectedJobId(data.jobId);
                  fetchJobStatus(data.jobId);
                } else {
                  showAppToast({
                    message: data.error || "Failed to copy job",
                    type: "error",
                  });
                }
              } catch (error) {
                showAppToast({
                  message: "An error occurred",
                  type: "error",
                });
              }
            }
          }}
          className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Copy this job"
        >
          📋 Copy
        </button>
        <button
          onClick={() => {
            const url = `/api/export-job?jobId=${encodeURIComponent(selectedJob.id)}&format=csv`;
            window.open(url, "_blank");
            showAppToast({
              message: "Export started",
              type: "info",
            });
          }}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Export job report (CSV)"
        >
          📥 Export
        </button>
        <button
          onClick={() => setSelectedJobId(null)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold transition-colors"
        >
          ×
        </button>
      </div>
    </div>

    {/* Progress Statistics */}
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Overall Progress
        </span>
        <span className="text-lg font-bold text-gray-800 dark:text-white">
          {progressPercentage}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
        <div
          className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-800 dark:text-white">
            {totalVideos}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Total Videos
          </div>
        </div>
        <div className="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
            {completed}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
            ✅ Completed
          </div>
        </div>
        <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-700">
          <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {processing + pending}
          </div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            ⏳ Processing
          </div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">
            {failed}
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
            ❌ Failed
          </div>
        </div>
      </div>
    </div>

    {/* Current Processing Status */}
    {processing > 0 &&
      (() => {
        const currentItem = progress.find(
          (p: any) =>
            p &&
            p.status &&
            (p.status.includes("Uploading") ||
              p.status.includes("Fetching") ||
              p.status === "Pending" ||
              p.status.includes("thumbnail")),
        );

        if (currentItem) {
          const title =
            currentItem.title || `Video ${currentItem.index + 1}`;
          return (
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="text-3xl animate-pulse-slow">⚡</div>
                <div className="flex-1">
                  <div className="font-bold text-lg mb-1">
                    Currently Processing
                  </div>
                  <div className="text-sm opacity-90 font-medium mb-1">
                    {title}
                  </div>
                  <div className="text-xs opacity-75">
                    {currentItem.status}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

    {/* Remaining videos to upload - sheet view */}
    {processing + pending > 0 &&
      (() => {
        const jobItems = selectedJob.items || [];
        const remainingRows: Array<{
          index: number;
          title: string;
          status: string;
        }> = [];
        for (let i = 0; i < totalVideos; i++) {
          const prog = progress.find((p: any) => p && p.index === i);
          const isDone =
            prog &&
            (prog.videoId ||
              (prog.status &&
                (prog.status.includes("Uploaded") ||
                  prog.status.includes("Completed") ||
                  prog.status.includes("Scheduled") ||
                  prog.status.includes("scheduled") ||
                  prog.status.includes("Already uploaded"))));
          const isFailed =
            prog &&
            prog.status &&
            (prog.status.includes("Failed") ||
              prog.status.includes("Missing") ||
              prog.status.includes("Invalid") ||
              prog.status.includes("not found") ||
              prog.status.includes("error"));
          if (isDone || isFailed) continue;
          const item =
            Array.isArray(jobItems) && jobItems[i]
              ? jobItems[i]
              : null;
          const title =
            (item &&
              typeof item === "object" &&
              (item as any).title) ||
            (prog && prog.title) ||
            `Video ${i + 1}`;
          remainingRows.push({
            index: i,
            title:
              typeof title === "string" ? title : `Video ${i + 1}`,
            status: (prog && prog.status) || "Pending",
          });
        }
        if (remainingRows.length === 0) return null;
        const handleDownloadPending = async () => {
          try {
            const res = await fetch(
              `/api/export-pending?jobId=${selectedJobId}`,
              { credentials: "include" },
            );
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              showAppToast({
                message:
                  data.error || "Failed to download pending sheet",
                type: "error",
              });
              return;
            }
            const blob = await res.blob();
            const disp = res.headers.get("Content-Disposition");
            const match = disp && disp.match(/filename="?([^";]+)"?/);
            const name =
              match?.[1]?.trim() ||
              `pending-videos-${selectedJobId}.csv`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
            showAppToast({
              message: "Pending sheet downloaded",
              type: "success",
            });
          } catch (e) {
            showAppToast({
              message:
                e instanceof Error ? e.message : "Download failed",
              type: "error",
            });
          }
        };
        return (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() =>
                  setIsRemainingSheetCollapsed(
                    !isRemainingSheetCollapsed,
                  )
                }
                className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
              >
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  📋 Remaining videos to upload (
                  {remainingRows.length})
                </h4>
                <span className="text-gray-500 dark:text-gray-400 text-xs">
                  {isRemainingSheetCollapsed ? "▶" : "▼"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPending}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Generate (download CSV)
              </button>
            </div>
            {!isRemainingSheetCollapsed && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      <tr>
                        <th className="px-4 py-2 font-semibold w-12">
                          #
                        </th>
                        <th className="px-4 py-2 font-semibold">
                          Title
                        </th>
                        <th className="px-4 py-2 font-semibold w-36">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {remainingRows.map((row) => (
                        <tr
                          key={row.index}
                          className="border-t border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <td className="px-4 py-2 font-mono text-gray-600 dark:text-gray-400">
                            {row.index + 1}
                          </td>
                          <td
                            className="px-4 py-2 text-gray-800 dark:text-gray-200 truncate max-w-xs"
                            title={row.title}
                          >
                            {row.title}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                row.status.includes("Uploading") ||
                                row.status.includes("Checking")
                                  ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200"
                                  : "bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

    {/* Video List */}
    {progress.length > 0 ? (
      <div>
        <button
          onClick={() =>
            setIsVideoDetailsCollapsed(!isVideoDetailsCollapsed)
          }
          className="flex items-center gap-2 w-full text-left mb-3 hover:opacity-80 transition-opacity"
        >
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Video Details ({completed} / {totalVideos} completed)
          </h4>
          <span className="text-gray-500 dark:text-gray-400 text-xs">
            {isVideoDetailsCollapsed ? "▶" : "▼"}
          </span>
        </button>
        {!isVideoDetailsCollapsed && (
          <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
            {progress.map((item: any, idx: number) => {
              if (!item) return null;

              const isSuccess =
                item.videoId ||
                (item.status &&
                  (item.status.includes("Uploaded") ||
                    item.status.includes("Completed") ||
                    item.status.includes("Scheduled") ||
                    item.status.includes("scheduled") ||
                    item.status.includes("Already uploaded")));
              const isFailed =
                item.status &&
                (item.status.includes("Failed") ||
                  item.status.includes("Missing") ||
                  item.status.includes("Invalid") ||
                  item.status.includes("not found") ||
                  item.status.includes("Cannot access") ||
                  item.status.includes("error"));
              const isProcessing =
                item.status &&
                (item.status.includes("Uploading") ||
                  item.status === "Pending" ||
                  item.status.includes("thumbnail") ||
                  item.status.includes("Checking"));

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all ${
                    isSuccess
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                      : isFailed
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                        : isProcessing
                          ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700"
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg font-bold text-gray-800 dark:text-white flex-shrink-0">
                        {isSuccess
                          ? "✅"
                          : isFailed
                            ? "❌"
                            : isProcessing
                              ? "⏳"
                              : "⏸️"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 dark:text-white">
                            {item.title || `Video ${item.index + 1}`}
                          </span>
                          {item.videoId && (
                            <a
                              href={`https://www.youtube.com/watch?v=${item.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              🔗 View on YouTube
                            </a>
                          )}
                        </div>
                        {item.title && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Row {item.index + 1}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {item.fileSize && (
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                              📦 {formatFileSize(item.fileSize)}
                            </span>
                          )}
                          {item.duration && (
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                              ⏱️ {formatDuration(item.duration)}
                            </span>
                          )}
                          {item.uploadSpeed && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                              ⚡ {formatSpeed(item.uploadSpeed)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 ${
                          isSuccess
                            ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200"
                            : isFailed
                              ? "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200"
                              : isProcessing
                                ? "bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 animate-pulse-slow"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ) : (
      <div className="text-center py-8">
        <div className="text-5xl mb-3 animate-pulse-slow">⏳</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">
          Processing will begin shortly...
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          The first video will upload immediately once processing
          begins
        </p>
        {selectedJob && selectedJob.status === "processing" && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
              ⚡ Processing videos...
            </p>
          </div>
        )}
      </div>
    )}
  </div>
);
}
