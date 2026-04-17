type QueueItem = {
  id: string;
  status: string;
  items?: Array<{ title?: string; [key: string]: any }>;
  totalVideos?: number;
  videosPerDay?: number;
  startDate?: string;
  progress?: Array<{ status: string; title?: string; index?: number; videoId?: string }>;
};

export type UploadSummaryData = {
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
};

function isCompletedProgress(p: any): boolean {
  return !!(
    p &&
    (p.videoId ||
      (p.status &&
        (p.status.includes("Uploaded") ||
          p.status.includes("Completed") ||
          p.status.includes("scheduled") ||
          p.status.includes("Scheduled"))))
  );
}

export function calculateTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  if (diff <= 0) return "Uploading now...";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function buildUploadSummary(queue: QueueItem[]): UploadSummaryData | null {
  const activeJobs = queue.filter(
    (job) => job.status !== "completed" && job.status !== "failed" && job.status !== "cancelled",
  );
  if (activeJobs.length === 0) return null;

  const jobsWithScheduling = activeJobs.filter((job) => job.videosPerDay && job.videosPerDay > 0);
  const jobsImmediate = activeJobs.filter((job) => !job.videosPerDay || job.videosPerDay === 0);

  const immediateVideoCount = jobsImmediate.reduce((acc, job) => acc + (job.items?.length || job.totalVideos || 0), 0);
  const scheduledVideoCount = jobsWithScheduling.reduce((acc, job) => acc + (job.items?.length || job.totalVideos || 0), 0);

  const schedulingSettings = jobsWithScheduling.map((job) => {
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
      completedVideos: job.progress?.filter((p) => isCompletedProgress(p)).length || 0,
    };
  });

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const getVideoTitle = (job: QueueItem, index: number) => {
    const fromItems = job.items?.[index]?.title;
    if (typeof fromItems === "string" && fromItems.trim() && fromItems.trim() !== `Video ${index + 1}`) {
      return fromItems.trim();
    }
    const directProgressTitle = job.progress?.[index]?.title;
    if (typeof directProgressTitle === "string" && directProgressTitle.trim()) return directProgressTitle.trim();
    const matchedProgressTitle = job.progress?.find((p) => p && p.index === index)?.title;
    if (typeof matchedProgressTitle === "string" && matchedProgressTitle.trim()) return matchedProgressTitle.trim();
    return `Video ${index + 1}`;
  };

  const isVideoCompleted = (job: QueueItem, index: number) => job.progress?.some((p) => p && p.index === index && isCompletedProgress(p)) || false;

  let nextBatchVideos: Array<{ jobId: string; title: string; index: number }> = [];
  let nextBatchCount = 0;
  let nextBatchTime: Date | null = null;
  let isToday = false;

  jobsWithScheduling.forEach((job) => {
    if (!job.videosPerDay || job.videosPerDay <= 0 || nextBatchCount > 0) return;
    const startDate =
      job.startDate && !Number.isNaN(new Date(job.startDate).getTime())
        ? new Date(Date.UTC(new Date(job.startDate).getUTCFullYear(), new Date(job.startDate).getUTCMonth(), new Date(job.startDate).getUTCDate(), 0, 0, 0, 0))
        : new Date(today);
    const totalVideos = job.items?.length || job.totalVideos || 0;
    const todayDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (todayDiff < 0) {
      const firstBatchEnd = Math.min(job.videosPerDay, totalVideos);
      for (let i = 0; i < firstBatchEnd; i++) {
        if (!isVideoCompleted(job, i)) nextBatchVideos.push({ jobId: job.id, title: getVideoTitle(job, i), index: i });
      }
      if (nextBatchVideos.length > 0) {
        nextBatchCount = nextBatchVideos.length;
        nextBatchTime = startDate;
        isToday = false;
      }
      return;
    }

    const todayStart = todayDiff * job.videosPerDay;
    const todayEnd = Math.min(todayStart + job.videosPerDay, totalVideos);
    const todayPending: Array<{ jobId: string; title: string; index: number }> = [];
    for (let i = todayStart; i < todayEnd && i < totalVideos; i++) {
      if (!isVideoCompleted(job, i)) todayPending.push({ jobId: job.id, title: getVideoTitle(job, i), index: i });
    }
    if (todayPending.length > 0) {
      nextBatchVideos = todayPending;
      nextBatchCount = todayPending.length;
      nextBatchTime = now.getTime() >= today.getTime() ? now : today;
      isToday = true;
      return;
    }

    const tomorrowStart = (todayDiff + 1) * job.videosPerDay;
    const tomorrowEnd = Math.min(tomorrowStart + job.videosPerDay, totalVideos);
    if (tomorrowStart >= totalVideos) return;
    for (let i = tomorrowStart; i < tomorrowEnd && i < totalVideos; i++) {
      if (!isVideoCompleted(job, i)) nextBatchVideos.push({ jobId: job.id, title: getVideoTitle(job, i), index: i });
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
}
