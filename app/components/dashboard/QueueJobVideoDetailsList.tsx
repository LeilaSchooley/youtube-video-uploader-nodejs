"use client";

import { formatDuration, formatFileSize, formatSpeed } from "@/lib/queue-formatters";
import { isProgressFailure, isProgressProcessing, isProgressSuccess } from "./job-progress-status";
import type { ProgressItem } from "./queue-job-detail-types";
import type { BulkJob } from "./types";

type Props = {
  progress: ProgressItem[];
  selectedJob: BulkJob;
  completed: number;
  totalVideos: number;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
};

export default function QueueJobVideoDetailsList({
  progress,
  selectedJob,
  completed,
  totalVideos,
  isCollapsed,
  setIsCollapsed,
}: Props) {
  if (progress.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-3 animate-pulse-slow">⏳</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">Processing will begin shortly...</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          The first video will upload immediately once processing begins
        </p>
        {selectedJob.status === "processing" && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">⚡ Processing videos...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 w-full text-left mb-3 hover:opacity-80 transition-opacity"
      >
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Video Details ({completed} / {totalVideos} completed)
        </h4>
        <span className="text-gray-500 dark:text-gray-400 text-xs">{isCollapsed ? "▶" : "▼"}</span>
      </button>
      {!isCollapsed && (
        <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
          {progress.map((item, idx) => {
            if (!item) return null;
            const isSuccess = isProgressSuccess(item);
            const isFailed = isProgressFailure(item);
            const isProcessing = isProgressProcessing(item);

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
                      {isSuccess ? "✅" : isFailed ? "❌" : isProcessing ? "⏳" : "⏸️"}
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
                      {item.title && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Row {item.index + 1}</div>}
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {item.fileSize && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">📦 {formatFileSize(item.fileSize)}</span>}
                        {item.duration && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">⏱️ {formatDuration(item.duration)}</span>}
                        {item.uploadSpeed && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">⚡ {formatSpeed(item.uploadSpeed)}</span>
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
  );
}
