"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BulkJob,
  JobStatus,
  PythonQueueData,
} from "@/app/components/dashboard/types";
import {
  fetchDashboardQueueBundle,
  fetchJobStatusNormalized,
  dashboardQueryKeys,
  type DashboardQueueBundle,
} from "@/lib/dashboard-queries";
import { useAppToast } from "@/app/app-toast-context";

export interface UseQueueOptions {
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
}

export function useQueue({ requestConfirm }: UseQueueOptions) {
  const setShowToast = useAppToast();
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobFiles, setJobFiles] = useState<unknown>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextUploadTime, setNextUploadTime] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState("");

  const { data: bundle } = useQuery({
    queryKey: dashboardQueryKeys.queueBundle,
    queryFn: fetchDashboardQueueBundle,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 3000;
      const hasActiveBulk = d.queue.some(
        (j) => j.status === "pending" || j.status === "processing",
      );
      const pythonN = d.pythonQueue?.pending?.length ?? 0;
      const selectedActive =
        selectedJobId &&
        d.queue.some(
          (j) =>
            j.id === selectedJobId &&
            (j.status === "processing" || j.status === "pending"),
        );
      if (selectedActive) return 500;
      if (hasActiveBulk || pythonN > 0) return 1000;
      return 3000;
    },
  });

  const queue = useMemo(() => bundle?.queue ?? [], [bundle?.queue]);
  const workerBusy = bundle?.workerBusy ?? false;
  const workerHeartbeat = bundle?.workerHeartbeat ?? null;
  const pythonQueue: PythonQueueData | null = bundle?.pythonQueue ?? null;

  const selectedJobIsActive =
    !!selectedJobId &&
    queue.some(
      (j) =>
        j.id === selectedJobId &&
        (j.status === "processing" || j.status === "pending"),
    );

  const {
    data: jobStatusData,
    isSuccess: jobStatusFetchSuccess,
  } = useQuery({
    queryKey: dashboardQueryKeys.jobStatus(selectedJobId),
    queryFn: () => fetchJobStatusNormalized(selectedJobId!),
    enabled: !!selectedJobId,
    refetchInterval: selectedJobIsActive ? 500 : false,
  });
  const jobStatus: JobStatus = (jobStatusData ?? null) as JobStatus;

  const calculateNextUploadTime = useCallback(() => {
    const now = new Date();
    let earliestDate: Date | null = null;
    for (const job of queue) {
      if (
        job.videosPerDay &&
        job.videosPerDay > 0 &&
        job.status !== "failed" &&
        job.status !== "completed" &&
        job.status !== "cancelled"
      ) {
        const startDate = job.startDate ? new Date(job.startDate) : new Date();
        startDate.setHours(12, 0, 0, 0);
        const completedCount =
          job.progress?.filter(
            (p) =>
              p &&
              p.status &&
              (p.status.includes("Uploaded") ||
                p.status.includes("scheduled") ||
                p.status.includes("Scheduled")),
          ).length || 0;
        const totalVideos = job.items?.length || job.totalVideos || 0;
        if (completedCount < totalVideos) {
          const currentDayIndex = Math.floor(
            completedCount / (job.videosPerDay || 1),
          );
          const nextBatchStartTime = new Date(startDate);
          nextBatchStartTime.setDate(
            startDate.getDate() + currentDayIndex + 1,
          );
          nextBatchStartTime.setHours(12, 0, 0, 0);
          if (nextBatchStartTime > now) {
            if (!earliestDate || nextBatchStartTime < earliestDate) {
              earliestDate = nextBatchStartTime;
            }
          } else {
            if (!earliestDate || now < earliestDate) {
              earliestDate = new Date(now.getTime() + 1000);
            }
          }
        }
      }
    }
    setNextUploadTime(earliestDate);
  }, [queue]);

  useEffect(() => {
    const updateTimer = () => {
      if (!nextUploadTime) {
        setTimeUntilNext("");
        return;
      }
      const now = new Date();
      const diff = nextUploadTime.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeUntilNext("Uploading now...");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) setTimeUntilNext(`${days}d ${hours}h ${minutes}m`);
      else if (hours > 0)
        setTimeUntilNext(`${hours}h ${minutes}m ${seconds}s`);
      else if (minutes > 0) setTimeUntilNext(`${minutes}m ${seconds}s`);
      else setTimeUntilNext(`${seconds}s`);
    };
    updateTimer();
    const t = setInterval(updateTimer, 1000);
    return () => clearInterval(t);
  }, [nextUploadTime]);

  useEffect(() => {
    calculateNextUploadTime();
  }, [calculateNextUploadTime]);

  const fetchQueue = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.queueBundle,
    });
  }, [queryClient]);

  const removeJobFromQueue = useCallback(
    (jobId: string) => {
      queryClient.setQueryData<DashboardQueueBundle | undefined>(
        dashboardQueryKeys.queueBundle,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            queue: old.queue.filter((j) => j.id !== jobId),
          };
        },
      );
      setSelectedJobId((prev) => {
        if (prev === jobId) {
          setJobFiles(null);
          queryClient.removeQueries({
            queryKey: dashboardQueryKeys.jobStatus(jobId),
          });
          return null;
        }
        return prev;
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!selectedJobId || !jobStatusFetchSuccess) return;
    if (jobStatusData === null) {
      removeJobFromQueue(selectedJobId);
    }
  }, [
    selectedJobId,
    jobStatusFetchSuccess,
    jobStatusData,
    removeJobFromQueue,
  ]);

  const fetchJobStatus = useCallback(
    async (jobId: string) => {
      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.jobStatus(jobId),
      });
    },
    [queryClient],
  );

  const fetchJobFiles = useCallback(
    async (jobId: string) => {
      try {
        setLoadingFiles(true);
        const res = await fetch(`/api/delete-videos?jobId=${jobId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setJobFiles(data);
        } else if (
          res.status === 404 ||
          /not found|unauthorized/i.test(data?.error || "")
        ) {
          removeJobFromQueue(jobId);
        }
      } catch (err) {
        console.error("[ERROR] Error fetching job files:", err);
      } finally {
        setLoadingFiles(false);
      }
    },
    [removeJobFromQueue],
  );

  const handleQueueAction = useCallback(
    async (
      jobId: string,
      action:
        | "pause"
        | "resume"
        | "cancel"
        | "delete"
        | "delete-all-jobs"
        | "retry-failed",
    ) => {
      try {
        const body =
          action === "delete-all-jobs"
            ? JSON.stringify({ action })
            : JSON.stringify({ jobId, action });
        const res = await fetch("/api/queue-manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body,
        });
        const data = await res.json();
        if (res.ok) {
          setShowToast({ message: data.message, type: "success" });
          if (action === "delete" || action === "cancel") {
            removeJobFromQueue(jobId);
          }
          await fetchQueue();
          if (action === "retry-failed" && data.jobId) {
            setSelectedJobId(data.jobId);
            await fetchJobStatus(data.jobId);
          } else if (action === "delete" && selectedJobId === jobId) {
            setSelectedJobId(null);
          } else if (selectedJobId === jobId) {
            await fetchJobStatus(jobId);
            setTimeout(() => {
              void fetchQueue();
              if (selectedJobId === jobId) void fetchJobStatus(jobId);
            }, 500);
          }
        } else {
          const errMsg = data.error || "";
          if (res.status === 404 || /not found|unauthorized/i.test(errMsg)) {
            removeJobFromQueue(jobId);
          }
          setShowToast({
            message: errMsg || "Failed to perform action",
            type: "error",
          });
        }
      } catch {
        setShowToast({ message: "An error occurred", type: "error" });
      }
    },
    [
      setShowToast,
      fetchQueue,
      fetchJobStatus,
      selectedJobId,
      removeJobFromQueue,
    ],
  );

  const handleDeleteFile = useCallback(
    async (jobId: string, filePath: string, fileName: string) => {
      const ok = await requestConfirm({
        title: "Delete file",
        message: `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/delete-videos?jobId=${jobId}&filePath=${encodeURIComponent(filePath)}`,
          { method: "DELETE", credentials: "include" },
        );
        const data = await res.json();
        if (res.ok) {
          setShowToast({
            message: data.message || "File deleted successfully",
            type: "success",
          });
          fetchJobFiles(jobId);
        } else {
          setShowToast({
            message: data.error || "Failed to delete file",
            type: "error",
          });
        }
      } catch {
        setShowToast({
          message: "An error occurred while deleting the file",
          type: "error",
        });
      }
    },
    [requestConfirm, setShowToast, fetchJobFiles],
  );

  const handleDeleteAllFiles = useCallback(
    async (jobId: string) => {
      const ok = await requestConfirm({
        title: "Delete all files",
        message:
          "Are you sure you want to delete ALL uploaded files for this job? This action cannot be undone.",
        confirmLabel: "Delete all",
        variant: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/delete-videos?jobId=${jobId}&deleteAll=true`,
          { method: "DELETE", credentials: "include" },
        );
        const data = await res.json();
        if (res.ok) {
          setShowToast({
            message: data.message || "All files deleted successfully",
            type: "success",
          });
          fetchJobFiles(jobId);
        } else {
          setShowToast({
            message: data.error || "Failed to delete files",
            type: "error",
          });
        }
      } catch {
        setShowToast({
          message: "An error occurred while deleting files",
          type: "error",
        });
      }
    },
    [requestConfirm, setShowToast, fetchJobFiles],
  );

  useEffect(() => {
    if (selectedJobId) {
      void fetchJobStatus(selectedJobId);
      void fetchQueue();
      void fetchJobFiles(selectedJobId);
    }
  }, [selectedJobId, fetchJobStatus, fetchQueue, fetchJobFiles]);

  const setQueue = useCallback(
    (updater: BulkJob[] | ((prev: BulkJob[]) => BulkJob[])) => {
      queryClient.setQueryData<DashboardQueueBundle | undefined>(
        dashboardQueryKeys.queueBundle,
        (old) => {
          if (!old) return old;
          const next =
            typeof updater === "function" ? updater(old.queue) : updater;
          return { ...old, queue: next };
        },
      );
    },
    [queryClient],
  );

  return {
    queue,
    setQueue,
    workerBusy,
    workerHeartbeat,
    pythonQueue,
    selectedJobId,
    setSelectedJobId,
    jobStatus,
    setJobStatus: () => {
      /* job status is driven by TanStack Query; kept for API compatibility */
    },
    jobFiles,
    loadingFiles,
    searchQuery,
    setSearchQuery,
    nextUploadTime,
    timeUntilNext,
    fetchQueue,
    fetchJobStatus,
    fetchJobFiles,
    handleQueueAction,
    handleDeleteFile,
    handleDeleteAllFiles,
  };
}
