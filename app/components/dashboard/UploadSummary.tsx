"use client";

import { useMemo, useState, useEffect } from "react";
import { buildUploadSummary, calculateTimeUntil } from "./upload-summary-helpers";

interface QueueItem {
  id: string;
  status: string;
  items?: Array<{ title?: string; [key: string]: any }>;
  totalVideos?: number;
  videosPerDay?: number;
  startDate?: string;
  progress?: Array<{ status: string; title?: string; index?: number; videoId?: string }>;
}

interface UploadSummaryProps {
  queue: QueueItem[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
}

export default function UploadSummary({
  queue,
  nextUploadTime,
  timeUntilNext,
}: UploadSummaryProps) {
  const [nextDayCountdown, setNextDayCountdown] = useState<string>("");
  
  const summary = useMemo(() => buildUploadSummary(queue), [queue]);

  // Update countdown for next day
  useEffect(() => {
    if (!summary?.nextDayTime) {
      setNextDayCountdown("");
      return;
    }

    const updateCountdown = () => {
      const nextDayTime = summary.nextDayTime;
      if (nextDayTime) {
        setNextDayCountdown(calculateTimeUntil(nextDayTime));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [summary]);

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
          {summary.nextDayTime && summary.nextDayCount > 0 ? (
            <div className={`p-4 rounded-lg border ${summary.isToday ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`text-3xl font-bold ${summary.isToday ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {summary.isToday ? (nextDayCountdown === "Uploading now..." ? "⚡ Now" : nextDayCountdown || "Ready") : (nextDayCountdown || "Calculating...")}
                </div>
                <div className={`text-2xl font-bold ${summary.isToday ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                  {summary.nextDayCount} video{summary.nextDayCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {summary.isToday ? "📅 Uploading Today" : summary.nextDayTime ? `Scheduled for ${summary.nextDayTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}` : "Calculating..."}
              </div>
              
              {/* List of videos scheduled for next batch */}
              {summary.nextDayVideos.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    {summary.isToday ? "Videos Uploading Today:" : "Videos Uploading Tomorrow:"}
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {summary.nextDayVideos.slice(0, 10).map((video, idx) => (
                      <div
                        key={`${video.jobId}-${video.index}`}
                        className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-2"
                      >
                        <span className="text-purple-600 dark:text-purple-400 font-mono">
                          {idx + 1}.
                        </span>
                        <span className="truncate flex-1" title={video.title}>
                          {video.title}
                        </span>
                      </div>
                    ))}
                    {summary.nextDayVideos.length > 10 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                        +{summary.nextDayCount - 10} more...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : nextUploadTime && timeUntilNext ? (
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
