"use client";

import { useMemo } from "react";
import type { BulkUploadItem } from "@/lib/bulk-queue";

interface UploadSummaryProps {
  queue: BulkUploadItem[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
}

export default function UploadSummary({
  queue,
  nextUploadTime,
  timeUntilNext,
}: UploadSummaryProps) {
  const summary = useMemo(() => {
    const activeJobs = queue.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled"
    );

    if (activeJobs.length === 0) {
      return null;
    }

    const jobsWithScheduling = activeJobs.filter(
      (job) => job.videosPerDay && job.videosPerDay > 0
    );
    const jobsImmediate = activeJobs.filter(
      (job) => !job.videosPerDay || job.videosPerDay === 0
    );

    // Count immediate upload videos
    let immediateVideoCount = 0;
    jobsImmediate.forEach((job) => {
      immediateVideoCount += job.items.length;
    });

    // Count scheduled videos
    let scheduledVideoCount = 0;
    jobsWithScheduling.forEach((job) => {
      scheduledVideoCount += job.items.length;
    });

    // Get scheduling settings
    const schedulingSettings = jobsWithScheduling.map((job) => ({
      jobId: job.id,
      videosPerDay: job.videosPerDay || 0,
      startDate: job.startDate
        ? new Date(job.startDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
      totalVideos: job.items.length,
      completedVideos:
        job.progress?.filter(
          (p) =>
            p.status.includes("Uploaded") ||
            p.status.includes("scheduled") ||
            p.status.includes("Scheduled")
        ).length || 0,
    }));

    return {
      immediateVideoCount,
      scheduledVideoCount,
      schedulingSettings,
      jobsImmediate,
      jobsWithScheduling,
    };
  }, [queue]);

  if (!summary) {
    return null;
  }

  return (
    <div className="mt-8 p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Countdown Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">⏰</span>
            <span>Next Upload Time</span>
          </h3>
          {nextUploadTime && timeUntilNext ? (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {timeUntilNext}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {nextUploadTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-lg text-gray-500 dark:text-gray-400">
                No scheduled uploads
              </div>
            </div>
          )}
        </div>

        {/* Settings & Status Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span>Upload Summary</span>
          </h3>

          <div className="space-y-3">
            {/* Immediate Uploads */}
            {summary.immediateVideoCount > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    <span className="font-semibold text-green-800 dark:text-green-200">
                      Uploading Immediately
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {summary.immediateVideoCount}
                  </span>
                </div>
                <div className="text-xs text-green-700 dark:text-green-300 mt-2">
                  {summary.jobsImmediate.length} job
                  {summary.jobsImmediate.length !== 1 ? "s" : ""} queued for
                  immediate processing
                </div>
              </div>
            )}

            {/* Scheduled Uploads */}
            {summary.schedulingSettings.length > 0 && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📅</span>
                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                      Scheduled Uploads
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {summary.scheduledVideoCount}
                  </span>
                </div>
                <div className="space-y-2">
                  {summary.schedulingSettings.map((setting, idx) => (
                    <div
                      key={setting.jobId || idx}
                      className="text-xs bg-white dark:bg-gray-800 p-2 rounded border border-blue-100 dark:border-blue-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-blue-700 dark:text-blue-300 font-medium">
                          {setting.videosPerDay} videos/day
                        </span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {setting.completedVideos}/{setting.totalVideos} done
                        </span>
                      </div>
                      {setting.startDate && (
                        <div className="text-blue-600 dark:text-blue-400 mt-1">
                          Started: {setting.startDate}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
