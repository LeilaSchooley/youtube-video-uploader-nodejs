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
  
  const summary = useMemo((): {
    immediateVideoCount: number;
    scheduledVideoCount: number;
    schedulingSettings: Array<{
      jobId: string;
      videosPerDay: number;
      startDate: string | null;
      totalVideos: number;
      completedVideos: number;
    }>;
    jobsImmediate: QueueItem[];
    jobsWithScheduling: QueueItem[];
    nextDayVideos: Array<{ jobId: string; title: string; index: number }>;
    nextDayCount: number;
    nextDayTime: Date | null;
    isToday: boolean;
  } | null => {
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
            (p: any) =>
              p && (p.videoId || (p.status && (
                p.status.includes("Uploaded") ||
                p.status.includes("Completed") ||
                p.status.includes("scheduled") ||
                p.status.includes("Scheduled")
              )))
          ).length || 0,
      };
    });

    // Calculate videos scheduled for next upload (using UTC for day boundaries to match worker)
    const now = new Date();
    // Use UTC midnight for day boundaries (matches worker)
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    
    // Helper to get video title
    const getVideoTitle = (job: QueueItem, index: number): string => {
      let videoTitle = `Video ${index + 1}`;
      
      // Try to get title from job.items (from sheet) first
      if (job.items && Array.isArray(job.items) && job.items.length > index) {
        const item = job.items[index];
        if (item && typeof item === 'object') {
          const itemTitle = item.title;
          if (itemTitle && typeof itemTitle === 'string' && itemTitle.trim() && itemTitle.trim() !== `Video ${index + 1}`) {
            return itemTitle.trim();
          }
        }
      }
      
      // Fallback to progress title
      if (job.progress && job.progress[index] && job.progress[index].title) {
        const progressTitle = job.progress[index].title;
        if (progressTitle && typeof progressTitle === 'string' && progressTitle.trim()) {
          return progressTitle.trim();
        }
      }
      
      // Also check by index match
      const progressItem = job.progress?.find((p) => p && p.index === index);
      if (progressItem && progressItem.title && typeof progressItem.title === 'string' && progressItem.title.trim()) {
        return progressItem.title.trim();
      }
      
      return videoTitle;
    };
    
    // Helper to check if video is completed
    const isVideoCompleted = (job: QueueItem, index: number): boolean => {
      return job.progress?.some(
        (p: any) => p && p.index === index && (p.videoId || (p.status && (
          p.status.includes("Uploaded") ||
          p.status.includes("Completed") ||
          p.status.includes("scheduled") || 
          p.status.includes("Scheduled")
        )))
      ) || false;
    };
    
    // Find next batch of videos to upload
    let nextBatchVideos: Array<{ jobId: string; title: string; index: number }> = [];
    let nextBatchCount = 0;
    let nextBatchTime: Date | null = null;
    let isToday = false;
    
    jobsWithScheduling.forEach((job) => {
      if (!job.videosPerDay || job.videosPerDay <= 0) return;
      if (nextBatchCount > 0) return; // Already found a batch
      
      // Use startDate if provided and valid, otherwise use today (UTC)
      let startDate: Date;
      if (job.startDate && !isNaN(new Date(job.startDate).getTime())) {
        const startDateRaw = new Date(job.startDate);
        startDate = new Date(Date.UTC(startDateRaw.getUTCFullYear(), startDateRaw.getUTCMonth(), startDateRaw.getUTCDate(), 0, 0, 0, 0));
      } else {
        // No startDate set - assume job starts TODAY (UTC)
        startDate = new Date(today);
      }
      
      const totalVideos = job.items?.length || job.totalVideos || 0;
      
      // Count completed videos to determine current position
      const completedCount = job.progress?.filter(
        (p: any) => p && (p.videoId || (p.status && (
          p.status.includes("Uploaded") ||
          p.status.includes("Completed") ||
          p.status.includes("scheduled") ||
          p.status.includes("Scheduled")
        )))
      ).length || 0;
      
      // Calculate today's day index from start date
      const todayDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // If start date is in the future, show first batch as "upcoming"
      if (todayDiff < 0) {
        // Show first batch scheduled for start date
        const firstBatchEndIndex = Math.min(job.videosPerDay, totalVideos);
        for (let i = 0; i < firstBatchEndIndex; i++) {
          if (!isVideoCompleted(job, i)) {
            nextBatchVideos.push({
              jobId: job.id,
              title: getVideoTitle(job, i),
              index: i,
            });
          }
        }
        if (nextBatchVideos.length > 0) {
          nextBatchCount = nextBatchVideos.length;
          nextBatchTime = startDate;
          isToday = false;
        }
        return;
      }
      
      // Check today's batch first
      const todayStartIndex = todayDiff * job.videosPerDay;
      const todayEndIndex = Math.min(todayStartIndex + job.videosPerDay, totalVideos);
      
      // Find pending videos in today's batch
      const todayPendingVideos: Array<{ jobId: string; title: string; index: number }> = [];
      for (let i = todayStartIndex; i < todayEndIndex && i < totalVideos; i++) {
        if (!isVideoCompleted(job, i)) {
          todayPendingVideos.push({
            jobId: job.id,
            title: getVideoTitle(job, i),
            index: i,
          });
        }
      }
      
      if (todayPendingVideos.length > 0) {
        // There are still pending videos for today
        nextBatchVideos = todayPendingVideos;
        nextBatchCount = todayPendingVideos.length;
        // If it's past noon, show "now"; if before noon, show noon
        nextBatchTime = now.getTime() >= today.getTime() ? now : today;
        isToday = true;
        return;
      }
      
      // Today's batch is complete, check tomorrow's batch
      const tomorrowDiff = todayDiff + 1;
      const tomorrowStartIndex = tomorrowDiff * job.videosPerDay;
      const tomorrowEndIndex = Math.min(tomorrowStartIndex + job.videosPerDay, totalVideos);
      
      if (tomorrowStartIndex >= totalVideos) return; // No more videos
      
      for (let i = tomorrowStartIndex; i < tomorrowEndIndex && i < totalVideos; i++) {
        if (!isVideoCompleted(job, i)) {
          nextBatchVideos.push({
            jobId: job.id,
            title: getVideoTitle(job, i),
            index: i,
          });
        }
      }
      
      if (nextBatchVideos.length > 0) {
        nextBatchCount = nextBatchVideos.length;
        nextBatchTime = tomorrow;
        isToday = false;
      }
    });

    return {
      immediateVideoCount,
      scheduledVideoCount,
      schedulingSettings,
      jobsImmediate,
      jobsWithScheduling,
      nextDayVideos: nextBatchVideos,
      nextDayCount: nextBatchCount,
      nextDayTime: nextBatchTime,
      isToday,
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
