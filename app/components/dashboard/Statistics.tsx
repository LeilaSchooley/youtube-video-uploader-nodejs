"use client";

import { useAppToast } from "@/app/app-toast-context";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import StatisticsQueueOverview from "./StatisticsQueueOverview";
import StatisticsUploadedVideosPanel from "./StatisticsUploadedVideosPanel";
import { TestCommentDialog } from "./TestCommentDialog";
import type { ConfirmFn, UploadedVideoRecord } from "./statistics-types";

const STATS_AUTO_POLL_MS = 10_000;
const STATS_CHANNELS_POLL_MS = 60_000;

const UPLOAD_HISTORY_CHANNEL_STORAGE_KEY =
  "youtube-uploader-stats-upload-channel-filter";

function readStoredUploadChannelPreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(UPLOAD_HISTORY_CHANNEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredUploadChannelPreference(value: string) {
  try {
    localStorage.setItem(UPLOAD_HISTORY_CHANNEL_STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearStoredUploadChannelPreference() {
  try {
    localStorage.removeItem(UPLOAD_HISTORY_CHANNEL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isKnownChannelId(
  id: string,
  videos: UploadedVideoRecord[],
  ytChannelIds: Set<string>,
): boolean {
  if (ytChannelIds.has(id)) return true;
  return videos.some((v) => v.channelId === id);
}

/**
 * Preference order:
 * 1. Saved localStorage choice (if still valid)
 * 2. channelId on the newest upload row that has one
 * 3. First channel from the YouTube channels API list (already fetched)
 * 4. "all"
 */
function resolveInitialUploadChannelFilter(
  stored: string | null,
  videos: UploadedVideoRecord[],
  ytChannelIds: Set<string>,
  ytChannelsList: Array<{ id: string; title: string }>,
): string {
  if (stored === "all") return "all";
  if (stored && isKnownChannelId(stored, videos, ytChannelIds)) {
    return stored;
  }
  const sorted = [...videos].sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
  for (const v of sorted) {
    if (v.channelId) return v.channelId;
  }
  if (ytChannelsList.length === 1) {
    return ytChannelsList[0].id;
  }
  return "all";
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
  const [uploadChannelFilter, setUploadChannelFilter] = useState<string>("all");
  const [uploadVideoTypeFilter, setUploadVideoTypeFilter] = useState<string>("all");
  const [ytChannels, setYtChannels] = useState<Array<{ id: string; title: string }>>([]);
  const [ytChannelsResolved, setYtChannelsResolved] = useState(false);
  const uploadChannelDefaultAppliedRef = useRef(false);
  const [loadingUploadedVideos, setLoadingUploadedVideos] = useState(false);
  const [syncingFromQueue, setSyncingFromQueue] = useState(false);
  const [uploadedVideosError, setUploadedVideosError] = useState<string | null>(null);
  const [testCommentDialogOpen, setTestCommentDialogOpen] = useState(false);
  const [testCommentLoading, setTestCommentLoading] = useState(false);

  const fetchYtChannels = useCallback(async () => {
    setYtChannelsResolved(false);
    try {
      const r = await fetch("/api/youtube/channels", { credentials: "include" });
      const d = (await r.json()) as { channels?: Array<{ id: string; title: string }> };
      if (Array.isArray(d.channels)) setYtChannels(d.channels);
      else setYtChannels([]);
    } catch {
      setYtChannels([]);
    } finally {
      setYtChannelsResolved(true);
    }
  }, []);

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

  useEffect(() => {
    if (!isActive) return;
    void fetchYtChannels();
  }, [isActive, fetchYtChannels]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      if (!loadingUploadedVideos && !syncingFromQueue) {
        void loadUploadedVideos(false);
      }
    }, STATS_AUTO_POLL_MS);
    return () => clearInterval(id);
  }, [
    isActive,
    loadingUploadedVideos,
    syncingFromQueue,
    loadUploadedVideos,
  ]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      void fetchYtChannels();
    }, STATS_CHANNELS_POLL_MS);
    return () => clearInterval(id);
  }, [isActive, fetchYtChannels]);

  useEffect(() => {
    if (!isActive || uploadedVideos === null || !ytChannelsResolved) return;
    if (uploadChannelDefaultAppliedRef.current) return;

    const stored = readStoredUploadChannelPreference();
    const ytIds = new Set(ytChannels.map((c) => c.id));
    const resolved = resolveInitialUploadChannelFilter(
      stored,
      uploadedVideos,
      ytIds,
      ytChannels,
    );
    setUploadChannelFilter(resolved);

    const hadNoStoredPreference = stored === null || stored === "";
    const storedWasInvalid =
      stored &&
      stored !== "all" &&
      !isKnownChannelId(stored, uploadedVideos, ytIds);
    if (
      resolved !== "all" &&
      (hadNoStoredPreference || storedWasInvalid)
    ) {
      writeStoredUploadChannelPreference(resolved);
    }

    /* Allow re-infer after e.g. clear history then Load list with new rows. */
    if (uploadedVideos.length === 0 && resolved === "all") {
      uploadChannelDefaultAppliedRef.current = false;
    } else {
      uploadChannelDefaultAppliedRef.current = true;
    }
  }, [isActive, uploadedVideos, ytChannels, ytChannelsResolved]);

  const setUploadChannelFilterPersisted = useCallback((value: string) => {
    setUploadChannelFilter(value);
    writeStoredUploadChannelPreference(value);
  }, []);

  const setUploadVideoTypeFilterPersisted = useCallback((value: string) => {
    setUploadVideoTypeFilter(value);
  }, []);

  const displayedUploadedVideos = useMemo(() => {
    if (uploadedVideos === null) return null;
    let filtered = uploadedVideos;
    
    if (uploadChannelFilter !== "all") {
      filtered = filtered.filter((v) => v.channelId === uploadChannelFilter);
    }
    
    if (uploadVideoTypeFilter !== "all") {
      filtered = filtered.filter((v) => (v.videoType || "untyped") === uploadVideoTypeFilter);
    }
    
    return filtered;
  }, [uploadedVideos, uploadChannelFilter, uploadVideoTypeFilter]);

  const uploadsByDay = useMemo(() => {
    if (!displayedUploadedVideos?.length) return [];
    const days = 14;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const counts = new Map<string, number>();
    for (const v of displayedUploadedVideos) {
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
  }, [displayedUploadedVideos]);

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
      const ch =
        uploadChannelFilter !== "all"
          ? `&channelId=${encodeURIComponent(uploadChannelFilter)}`
          : "";
      const res = await fetch(
        `/api/uploaded-videos?format=csv${ch}`,
        { credentials: "include" },
      );
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
  }, [uploadChannelFilter]);

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
        uploadChannelDefaultAppliedRef.current = false;
        setUploadChannelFilter("all");
        clearStoredUploadChannelPreference();
        setUploadedVideosError(null);
        showAppToast({ message: data.message || "Upload history cleared", type: "success" });
      } else {
        showAppToast({ message: data.error || "Failed to clear", type: "error" });
      }
    } catch {
      showAppToast({ message: "Failed to clear upload history", type: "error" });
    }
  }, [showAppToast]);

  const testCommentPost = useCallback(async (videoId: string, commentText: string) => {
    setTestCommentLoading(true);
    try {
      const res = await fetch("/api/test-comment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, commentText }),
      });
      const data = await res.json() as {
        success?: boolean;
        error?: string;
        message?: string;
        commentId?: string;
      };
      if (res.ok && data.success) {
        showAppToast({
          message: `✅ Comment posted successfully! (ID: ${data.commentId})`,
          type: "success",
        });
        setTestCommentDialogOpen(false);
      } else {
        showAppToast({
          message: `❌ ${data.error || "Failed to post comment"}`,
          type: "error",
        });
      }
    } catch (e) {
      showAppToast({
        message: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
        type: "error",
      });
    } finally {
      setTestCommentLoading(false);
    }
  }, [showAppToast]);

  return (
    <>
      <StatisticsUploadedVideosPanel
        uploadedVideos={displayedUploadedVideos}
        uploadHistoryFull={uploadedVideos}
        uploadedVideosTotalCount={uploadedVideos?.length ?? 0}
        autoPollMs={STATS_AUTO_POLL_MS}
        uploadChannelFilter={uploadChannelFilter}
        onUploadChannelFilterChange={setUploadChannelFilterPersisted}
        uploadVideoTypeFilter={uploadVideoTypeFilter}
        onUploadVideoTypeFilterChange={setUploadVideoTypeFilterPersisted}
        ytChannels={ytChannels}
        loadingUploadedVideos={loadingUploadedVideos}
        syncingFromQueue={syncingFromQueue}
        uploadedVideosError={uploadedVideosError}
        uploadsByDay={uploadsByDay}
        requestConfirm={requestConfirm}
        loadUploadedVideos={loadUploadedVideos}
        syncFromQueue={syncFromQueue}
        downloadUploadedVideosCsv={downloadUploadedVideosCsv}
        clearUploadHistory={clearUploadHistory}
        onTestCommentClick={() => setTestCommentDialogOpen(true)}
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
      <TestCommentDialog
        open={testCommentDialogOpen}
        onOpenChange={setTestCommentDialogOpen}
        onSubmit={testCommentPost}
        isLoading={testCommentLoading}
      />
    </>
  );
}


