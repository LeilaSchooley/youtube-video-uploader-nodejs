"use client";

import { useMemo, useState, useEffect } from "react";

interface QueueItem {
  id: string;
  status: string;
  items?: Array<{ title?: string; [key: string]: any }>; // Bulk queue items have this
  totalVideos?: number; // Regular queue items have this
  videosPerDay?: number;
  startDate?: string;
  progress?: Array<{ status: string; title?: string; index?: number }>;
}

interface UploadSummaryProps {
  queue: QueueItem[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
}

// Helper function to calculate time until a specific date
function calculateTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  
  if (diff <= 0) {
    return "Uploading now...";
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export default function UploadSummary({
  queue,
  nextUploadTime,
  timeUntilNext,
}: UploadSummaryProps) {
  const [nextDayCountdown, setNextDayCountdown] = useState<string>("");
  
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
      // Bulk queue items have `items`, regular queue items have `totalVideos`
      const count = job.items?.length || job.totalVideos || 0;
      immediateVideoCount += count;
    });

    // Count scheduled videos
    let scheduledVideoCount = 0;
    jobsWithScheduling.forEach((job) => {
      // Bulk queue items have `items`, regular queue items have `totalVideos`
      const count = job.items?.length || job.totalVideos || 0;
      scheduledVideoCount += count;
    });

    // Get scheduling settings
    const schedulingSettings = jobsWithScheduling.map((job) => {
      // Bulk queue items have `items`, regular queue items have `totalVideos`
      const totalVideos = job.items?.length || job.totalVideos || 0;
      return {
        jobId: job.id,
        videosPerDay: job.videosPerDay || 0,
        startDate: job.startDate
          ? new Date(job.startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : null,
        totalVideos,
        completedVideos:
          job.progress?.filter(
            (p) =>
              p && p.status && (
                p.status.includes("Uploaded") ||
                p.status.includes("scheduled") ||
                p.status.includes("Scheduled")
              )
          ).length || 0,
      };
    });

    // Calculate videos scheduled for next day
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0); // Noon
    
    const nextDayVideos: Array<{ jobId: string; title: string; index: number }> = [];
    let nextDayCount = 0;
    
    jobsWithScheduling.forEach((job) => {
      if (!job.videosPerDay || job.videosPerDay <= 0) return;
      
      // Use startDate if provided, otherwise use today
      const startDate = job.startDate ? new Date(job.startDate) : new Date();
      startDate.setHours(12, 0, 0, 0); // Noon
      
      // Calculate which day index tomorrow is (0 = startDate, 1 = startDate + 1 day, etc.)
      const daysDiff = Math.floor((tomorrow.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // If startDate is today or in the past, daysDiff will be 0 or positive
      // If startDate is in the future, daysDiff will be negative - skip those
      if (daysDiff < 0) return; // Tomorrow is before start date
      
      // Get total videos and completed count
      const totalVideos = job.items?.length || job.totalVideos || 0;
      const completedCount = job.progress?.filter(
        (p) =>
          p && p.status && (
            p.status.includes("Uploaded") ||
            p.status.includes("scheduled") ||
            p.status.includes("Scheduled")
          )
      ).length || 0;
      
      // Calculate which videos are scheduled for tomorrow
      // Videos are assigned: dayIndex = Math.floor(videoIndex / videosPerDay)
      const startIndex = daysDiff * job.videosPerDay;
      const endIndex = Math.min(startIndex + job.videosPerDay, totalVideos);
      
      // Only include videos that haven't been uploaded yet
      for (let i = startIndex; i < endIndex && i < totalVideos; i++) {
        // Check if this video is already completed
        const isCompleted = job.progress?.some(
          (p) => p && p.index === i && p.status && (p.status.includes("Uploaded") || p.status.includes("scheduled") || p.status.includes("Scheduled"))
        );
        
        if (!isCompleted && i >= completedCount) {
          // Get video title - prefer items array (from sheet), fallback to progress
          let videoTitle = `Video ${i + 1}`;
          
          // Try to get title from job.items (from sheet) first
          if (job.items && Array.isArray(job.items) && job.items.length > i) {
            const item = job.items[i];
            if (item && typeof item === 'object') {
              const itemTitle = item.title;
              if (itemTitle && typeof itemTitle === 'string' && itemTitle.trim() && itemTitle.trim() !== `Video ${i + 1}`) {
                videoTitle = itemTitle.trim();
              }
            }
          }
          
          // Fallback to progress title if still using default
          if (videoTitle === `Video ${i + 1}`) {
            // Check by array index
            if (job.progress && job.progress[i] && job.progress[i].title) {
              const progressTitle = job.progress[i].title;
              if (progressTitle && typeof progressTitle === 'string' && progressTitle.trim()) {
                videoTitle = progressTitle.trim();
              }
            }
            // Also check by index match
            if (videoTitle === `Video ${i + 1}`) {
              const progressItem = job.progress?.find((p) => p && p.index === i);
              if (progressItem && progressItem.title && typeof progressItem.title === 'string' && progressItem.title.trim()) {
                videoTitle = progressItem.title.trim();
              }
            }
          }
          
          nextDayVideos.push({
            jobId: job.id,
            title: videoTitle,
            index: i,
          });
          nextDayCount++;
        }
      }
    });

    return {
      immediateVideoCount,
      scheduledVideoCount,
      schedulingSettings,
      jobsImmediate,
      jobsWithScheduling,
      nextDayVideos,
      nextDayCount,
      nextDayTime: jobsWithScheduling.length > 0 && nextDayCount > 0 ? tomorrow : null,
    };
  }, [queue]);

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
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {nextDayCountdown || "Calculating..."}
                </div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {summary.nextDayCount} video{summary.nextDayCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Scheduled for {summary.nextDayTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              
              {/* List of videos scheduled for next day */}
              {summary.nextDayVideos.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    Videos Uploading Next Day:
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
