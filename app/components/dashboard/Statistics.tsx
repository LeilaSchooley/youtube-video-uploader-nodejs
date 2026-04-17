"use client";

import { useAppToast } from "@/app/app-toast-context";
import { useState, useCallback, useEffect, useMemo } from "react";
import StatisticsQueueOverview from "./StatisticsQueueOverview";
import StatisticsUploadedVideosPanel from "./StatisticsUploadedVideosPanel";
import type { ConfirmFn, UploadedVideoRecord } from "./statistics-types";

interface ProgressItem {
  index: number;
  status: string;
}

interface StatisticsProps {
  queue: import("./types").BulkJob[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
  /** When true (Queue & statistics tab is active), auto-load uploaded videos list once if not yet loaded */
  isActive?: boolean;
  /** Optional: for "Clear upload history" confirmation */
  requestConfirm?: ConfirmFn;
}

export default function Statistics({ queue, nextUploadTime, timeUntilNext, isActive, requestConfirm }: StatisticsProps) {
  const showAppToast = useAppToast();
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideoRecord[] | null>(null);
  const [loadingUploadedVideos, setLoadingUploadedVideos] = useState(false);
  const [syncingFromQueue, setSyncingFromQueue] = useState(false);
  const [uploadedVideosError, setUploadedVideosError] = useState<string | null>(null);

  const loadUploadedVideos = useCallback(async (backfill = false) => {
    setLoadingUploadedVideos(true);
    setUploadedVideosError(null);
    try {
      const url = backfill ? "/api/uploaded-videos?backfill=1" : "/api/uploaded-videos";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUploadedVideos(data.videos || []);
    } catch (e) {
      setUploadedVideosError(e instanceof Error ? e.message : "Failed to load");
      setUploadedVideos(null);
    } finally {
      setLoadingUploadedVideos(false);
    }
  }, []);

  useEffect(() => {
    if (isActive && uploadedVideos === null && !loadingUploadedVideos) {
      loadUploadedVideos(false);
    }
  }, [isActive, uploadedVideos, loadingUploadedVideos, loadUploadedVideos]);

  const uploadsByDay = useMemo(() => {
    if (!uploadedVideos?.length) return [];
    const days = 14;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const counts = new Map<string, number>();
    for (const v of uploadedVideos) {
      const key = new Date(v.uploadedAt).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: { label: string; date: string; uploads: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      out.push({ label, date: key, uploads: counts.get(key) ?? 0 });
    }
    return out;
  }, [uploadedVideos]);

  const syncFromQueue = useCallback(async () => {
    setSyncingFromQueue(true);
    setUploadedVideosError(null);
    try {
      const res = await fetch("/api/uploaded-videos?backfill=1", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUploadedVideos(data.videos || []);
    } catch (e) {
      setUploadedVideosError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingFromQueue(false);
    }
  }, []);

  const downloadUploadedVideosCsv = useCallback(async () => {
    try {
      const res = await fetch("/api/uploaded-videos?format=csv", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uploaded-videos-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadedVideosError("Failed to download CSV");
    }
  }, []);

  const allProgress = queue.flatMap((job) => job.progress || []);
  const totalVideos = queue.reduce((sum, job) => {
    return sum + (job.totalVideos || job.progress?.length || 0);
  }, 0);
  
  const completed = allProgress.filter(
    (p) =>
      p && (p.videoId || (p.status && (
        p.status.includes("Uploaded") ||
        p.status.includes("Completed") ||
        p.status.includes("scheduled") ||
        p.status.includes("Scheduled") ||
        p.status.includes("Already uploaded")
      )))
  ).length;
  
  const failed = allProgress.filter(
    (p) =>
      p && p.status && (
        p.status.includes("Failed") || 
        p.status.includes("Missing") ||
        p.status.includes("Invalid") ||
        p.status.includes("not found") ||
        p.status.includes("Cannot access") ||
        p.status.includes("error")
      )
  ).length;
  
  const pending = allProgress.filter(
    (p) =>
      p && p.status && (
        p.status === "Pending" || 
        p.status.includes("Uploading") ||
        p.status.includes("thumbnail") ||
        p.status.includes("Checking")
      )
  ).length;
  
  const processing = queue.filter((job) => job.status === "processing").length;
  const completedJobs = queue.filter((job) => job.status === "completed").length;
  const failedJobs = queue.filter((job) => job.status === "failed").length;
  const pendingJobs = queue.filter((job) => job.status === "pending").length;

  const progressPercentage =
    totalVideos > 0
      ? Math.round((completed / totalVideos) * 100) 
      : completedJobs > 0 && queue.length === completedJobs
      ? 100
      : 0;
  
  const remaining = totalVideos > 0 ? totalVideos - completed - failed : 0;

  const exportStats = useCallback(async (format: "json" | "csv") => {
    try {
      const res = await fetch(`/api/export-stats?format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `youtube-uploader-stats-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setUploadedVideosError(
        e instanceof Error ? e.message : "Export failed",
      );
    }
  }, []);

  const clearUploadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/uploaded-videos", { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUploadedVideos([]);
        setUploadedVideosError(null);
        showAppToast({ message: data.message || "Upload history cleared", type: "success" });
      } else {
        showAppToast({ message: data.error || "Failed to clear", type: "error" });
      }
    } catch {
      showAppToast({ message: "Failed to clear upload history", type: "error" });
    }
  }, [showAppToast]);

  return (
    <>
      <StatisticsUploadedVideosPanel
        uploadedVideos={uploadedVideos}
        loadingUploadedVideos={loadingUploadedVideos}
        syncingFromQueue={syncingFromQueue}
        uploadedVideosError={uploadedVideosError}
        uploadsByDay={uploadsByDay}
        requestConfirm={requestConfirm}
        loadUploadedVideos={loadUploadedVideos}
        syncFromQueue={syncFromQueue}
        downloadUploadedVideosCsv={downloadUploadedVideosCsv}
        clearUploadHistory={clearUploadHistory}
      />
      <StatisticsQueueOverview
        queueLength={queue.length}
        nextUploadTime={nextUploadTime}
        timeUntilNext={timeUntilNext}
        exportStats={exportStats}
        processing={processing}
        progressPercentage={progressPercentage}
        totalVideos={totalVideos}
        completed={completed}
        pending={pending}
        failed={failed}
        completedJobs={completedJobs}
        pendingJobs={pendingJobs}
        failedJobs={failedJobs}
        remaining={remaining}
      />
    </>
  );
}


