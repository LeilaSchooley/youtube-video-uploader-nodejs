import type { BulkJob, JobStatus, PythonQueueData } from "@/app/components/dashboard/types";

export type DashboardQueueBundle = {
  queue: BulkJob[];
  workerBusy: boolean;
  workerHeartbeat: { lastRunAt: string; jobId?: string } | null;
  pythonQueue: PythonQueueData;
};

const FALLBACK_PYTHON: PythonQueueData = {
  enabled: false,
  maxPerTick: 1,
  skipDuplicateTitles: false,
  sessionIdEnvConfigured: false,
  pending: [],
  failedCount: 0,
  processedCount: 0,
  uploadsTodayUtc: 0,
  source: undefined,
  dropboxConfigured: false,
};

export async function fetchDashboardQueueBundle(): Promise<DashboardQueueBundle> {
  const fetchOpts = { credentials: "include" as const };
  const [qRes, pyRes] = await Promise.all([
    fetch(`/api/upload-queue?t=${Date.now()}`, fetchOpts),
    fetch(`/api/python-queue?t=${Date.now()}`, fetchOpts),
  ]);

  let queue: BulkJob[] = [];
  let workerBusy = false;
  let workerHeartbeat: DashboardQueueBundle["workerHeartbeat"] = null;

  const qData = await qRes.json();
  if (qRes.ok) {
    if (qData.queue) queue = qData.queue;
    workerBusy = !!qData.workerBusy;
    workerHeartbeat = qData.workerHeartbeat ?? null;
  }

  const pyData = await pyRes.json();
  const pythonQueue: PythonQueueData =
    pyRes.ok && !pyData.error ? (pyData as PythonQueueData) : FALLBACK_PYTHON;

  return { queue, workerBusy, workerHeartbeat, pythonQueue };
}

export async function fetchJobStatusNormalized(
  jobId: string,
): Promise<JobStatus | null> {
  const isBulkJob = jobId.startsWith("bulk-");
  const endpoint = isBulkJob ? "/api/bulk-status" : "/api/queue-status";
  const res = await fetch(`${endpoint}?jobId=${jobId}&t=${Date.now()}`, {
    credentials: "include",
  });
  const data = await res.json();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const job = data.job || data;
  const jobData = job || data;
  if (!jobData) return null;
  if (isBulkJob) {
    return {
      id: jobData.jobId || jobData.id,
      status: jobData.status,
      progress: jobData.progress || [],
      totalVideos: jobData.totalItems || jobData.progress?.length || 0,
      items: jobData.items || [],
      videosPerDay: jobData.videosPerDay,
      startDate: jobData.startDate,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      error: jobData.error,
    } as JobStatus;
  }
  return jobData as JobStatus;
}

export const dashboardQueryKeys = {
  queueBundle: ["dashboard-queue-bundle"] as const,
  jobStatus: (jobId: string | null) => ["job-status", jobId] as const,
};
