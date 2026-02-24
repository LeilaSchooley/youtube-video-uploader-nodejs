"use client";

import { useState, useCallback, useEffect } from "react";
import type { BulkJob, JobStatus } from "@/app/components/dashboard/types";

interface ProgressItem {
  index: number;
  status: string;
}

export interface UseQueueOptions {
  setShowToast: (toast: { message: string; type: "success" | "error" | "info" }) => void;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
  addDebugLog?: (message: string, type?: "info" | "success" | "error") => void;
}

export function useQueue({
  setShowToast,
  requestConfirm,
  addDebugLog = () => {},
}: UseQueueOptions) {
  const [queue, setQueue] = useState<BulkJob[]>([]);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerHeartbeat, setWorkerHeartbeat] = useState<{
    lastRunAt: string;
    jobId?: string;
  } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [jobFiles, setJobFiles] = useState<unknown>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextUploadTime, setNextUploadTime] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState("");

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
          const currentDayIndex = Math.floor(completedCount / (job.videosPerDay || 1));
          const nextBatchStartTime = new Date(startDate);
          nextBatchStartTime.setDate(startDate.getDate() + currentDayIndex + 1);
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
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) setTimeUntilNext(`${days}d ${hours}h ${minutes}m`);
      else if (hours > 0) setTimeUntilNext(`${hours}h ${minutes}m ${seconds}s`);
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
    try {
      const res = await fetch(`/api/upload-queue?t=${Date.now()}`);
      const data = await res.json();
      if (res.ok) {
        if (data.queue) setQueue(data.queue);
        setWorkerBusy(!!data.workerBusy);
        setWorkerHeartbeat(data.workerHeartbeat ?? null);
      }
    } catch (err) {
      console.error("[ERROR] Error fetching queue:", err);
    }
  }, []);

  const removeJobFromQueue = useCallback((jobId: string) => {
    setQueue((prev) => prev.filter((j) => j.id !== jobId));
    setSelectedJobId((prev) => {
      if (prev === jobId) {
        setJobStatus(null);
        setJobFiles(null);
        return null;
      }
      return prev;
    });
  }, []);

  const fetchJobStatus = useCallback(
    async (jobId: string) => {
      try {
        const isBulkJob = jobId.startsWith("bulk-");
        const endpoint = isBulkJob ? "/api/bulk-status" : "/api/queue-status";
        const res = await fetch(`${endpoint}?jobId=${jobId}&t=${Date.now()}`);
        const data = await res.json();
        if (res.ok) {
          const job = data.job || data;
          const jobData = job || data;
          if (jobData) {
            const normalizedJob = isBulkJob
              ? {
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
                }
              : jobData;
            setJobStatus(normalizedJob as JobStatus);
          }
        } else if (res.status === 404) {
          setJobStatus(null);
          removeJobFromQueue(jobId);
        }
      } catch (err) {
        console.error("[ERROR] Error fetching job status:", err);
      }
    },
    [removeJobFromQueue],
  );

  const fetchJobFiles = useCallback(async (jobId: string) => {
    try {
      setLoadingFiles(true);
      const res = await fetch(`/api/delete-videos?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok && data.success) setJobFiles(data);
    } catch (err) {
      console.error("[ERROR] Error fetching job files:", err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

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
          body,
        });
        const data = await res.json();
        if (res.ok) {
          setShowToast({ message: data.message, type: "success" });
          await fetchQueue();
          if (action === "retry-failed" && data.jobId) {
            setSelectedJobId(data.jobId);
            fetchJobStatus(data.jobId);
          } else if (action === "delete" && selectedJobId === jobId) {
            setSelectedJobId(null);
            setJobStatus(null);
          } else if (selectedJobId === jobId) {
            await fetchJobStatus(jobId);
            setTimeout(() => {
              fetchQueue();
              if (selectedJobId === jobId) fetchJobStatus(jobId);
            }, 500);
          }
        } else {
          setShowToast({ message: data.error || "Failed to perform action", type: "error" });
        }
      } catch {
        setShowToast({ message: "An error occurred", type: "error" });
      }
    },
    [setShowToast, fetchQueue, fetchJobStatus, selectedJobId],
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
          { method: "DELETE" },
        );
        const data = await res.json();
        if (res.ok) {
          setShowToast({ message: data.message || "File deleted successfully", type: "success" });
          fetchJobFiles(jobId);
        } else {
          setShowToast({ message: data.error || "Failed to delete file", type: "error" });
        }
      } catch {
        setShowToast({ message: "An error occurred while deleting the file", type: "error" });
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
        const res = await fetch(`/api/delete-videos?jobId=${jobId}&deleteAll=true`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (res.ok) {
          setShowToast({ message: data.message || "All files deleted successfully", type: "success" });
          fetchJobFiles(jobId);
        } else {
          setShowToast({ message: data.error || "Failed to delete files", type: "error" });
        }
      } catch {
        setShowToast({ message: "An error occurred while deleting files", type: "error" });
      }
    },
    [requestConfirm, setShowToast, fetchJobFiles],
  );

  const hasActiveJobs = queue.some(
    (j) => j.status === "processing" || j.status === "pending",
  );
  const selectedJobIsActive =
    selectedJobId &&
    queue.some(
      (j) =>
        j.id === selectedJobId &&
        (j.status === "processing" || j.status === "pending"),
    );
  // Poll faster (500ms) when user is watching an active job for more real-time updates
  const pollIntervalMs = selectedJobIsActive ? 500 : hasActiveJobs ? 1000 : 3000;

  useEffect(() => {
    fetchQueue();
    const poll = setInterval(() => {
      fetchQueue();
      if (selectedJobId) fetchJobStatus(selectedJobId);
    }, pollIntervalMs);
    return () => clearInterval(poll);
  }, [selectedJobId, pollIntervalMs, fetchQueue, fetchJobStatus]);

  useEffect(() => {
    if (selectedJobId) {
      fetchJobStatus(selectedJobId);
      fetchQueue();
      fetchJobFiles(selectedJobId);
    }
  }, [selectedJobId, fetchJobStatus, fetchQueue, fetchJobFiles]);

  return {
    queue,
    setQueue,
    workerBusy,
    workerHeartbeat,
    selectedJobId,
    setSelectedJobId,
    jobStatus,
    setJobStatus,
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
