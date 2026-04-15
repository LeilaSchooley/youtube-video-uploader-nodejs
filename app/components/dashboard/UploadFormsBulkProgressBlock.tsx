"use client";

import type { BulkUploadProgressState } from "./upload-forms-bulk-types";

export interface UploadFormsBulkProgressBlockProps {
  bulkUploadProgress: BulkUploadProgressState;
  bulkUploading: boolean;
}

export default function UploadFormsBulkProgressBlock({
  bulkUploadProgress,
  bulkUploading,
}: UploadFormsBulkProgressBlockProps) {
  return (
    <>
      {/* Progress Display */}
      {bulkUploadProgress && bulkUploading && (
  <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
        <div className="animate-spin text-xl">📤</div>
      </div>
      <div className="flex-1">
        <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
          Bulk Uploading Videos
        </div>
        <div className="text-sm text-blue-700 dark:text-blue-300">
          {bulkUploadProgress.message || "Preparing..."}
        </div>
      </div>
    </div>

    {/* Progress Bar - Always show when uploading */}
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-blue-800 dark:text-blue-200 font-medium">
          {bulkUploadProgress.currentBatch &&
          bulkUploadProgress.totalBatches ? (
            <span>
              Batch {bulkUploadProgress.currentBatch} /{" "}
              {bulkUploadProgress.totalBatches} •{" "}
            </span>
          ) : null}
          {bulkUploadProgress.completed || 0} succeeded,{" "}
          {bulkUploadProgress.failed || 0} failed
          {bulkUploadProgress.total
            ? " of " + bulkUploadProgress.total
            : ""}
        </span>
        <span className="text-blue-600 dark:text-blue-400 font-bold">
          {bulkUploadProgress.total > 0
            ? Math.round(
                ((bulkUploadProgress.completed +
                  bulkUploadProgress.failed) /
                  bulkUploadProgress.total) *
                  100,
              )
            : 0}
          %
        </span>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-4 dark:bg-blue-800 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-indigo-500 h-4 rounded-full transition-all duration-500 relative"
          style={{
            width:
              bulkUploadProgress.total > 0
                ? `${Math.min(
                    100,
                    Math.round(
                      ((bulkUploadProgress.completed +
                        bulkUploadProgress.failed) /
                        bulkUploadProgress.total) *
                        100,
                    ),
                  )}%`
                : "0%",
          }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
        </div>
      </div>
    </div>

    {bulkUploadProgress.currentFile && (
      <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-100 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <span className="text-blue-500">📁</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {bulkUploadProgress.currentFile}
          </span>
        </div>
      </div>
    )}
    </div>
      )}
    </>
  );
}
