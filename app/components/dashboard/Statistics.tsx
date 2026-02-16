"use client";

import { useState, useCallback, useEffect } from "react";

interface ProgressItem {
  index: number;
  status: string;
}

interface UploadedVideoRecord {
  videoId: string;
  title: string;
  jobId: string;
  uploadedAt: string;
}

interface StatisticsProps {
  queue: import("./types").BulkJob[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
  /** When true (Statistics tab is active), auto-load uploaded videos list once if not yet loaded */
  isActive?: boolean;
  /** Optional: for "Clear upload history" confirmation and toast */
  requestConfirm?: (opts: { title: string; message: string; confirmLabel?: string; variant?: "danger" | "default" }) => Promise<boolean>;
  setShowToast?: (t: { message: string; type: "success" | "error" | "info" }) => void;
}

export default function Statistics({ queue, nextUploadTime, timeUntilNext, isActive, requestConfirm, setShowToast }: StatisticsProps) {
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
    } catch {
      // Silent fail or could set error state
    }
  }, []);

  return (
    <>
      {/* All uploaded videos (persistent list) */}
      <div className="card border border-gray-100 dark:border-gray-700 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            📋 All uploaded videos
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadUploadedVideos(false)}
              disabled={loadingUploadedVideos}
              className="px-4 py-2 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm"
            >
              {loadingUploadedVideos ? "Loading…" : "Load list"}
            </button>
            <button
              type="button"
              onClick={syncFromQueue}
              disabled={syncingFromQueue}
              title="Add any completed videos from the queue that aren’t in the list yet"
              className="px-4 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm"
            >
              {syncingFromQueue ? "Syncing…" : "Sync from queue"}
            </button>
            {uploadedVideos && uploadedVideos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={downloadUploadedVideosCsv}
                  className="px-4 py-2 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-sm"
                >
                  Export CSV
                </button>
                {requestConfirm && setShowToast && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: "Clear upload history",
                        message: "This will clear the local list of uploaded videos only. Videos on your YouTube channel are not affected. Export CSV first if you want to keep a copy.",
                        confirmLabel: "Clear list",
                        variant: "danger",
                      });
                      if (!ok) return;
                      try {
                        const res = await fetch("/api/uploaded-videos", { method: "DELETE", credentials: "include" });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                          setUploadedVideos([]);
                          setUploadedVideosError(null);
                          setShowToast({ message: data.message || "Upload history cleared", type: "success" });
                        } else {
                          setShowToast({ message: data.error || "Failed to clear", type: "error" });
                        }
                      } catch {
                        setShowToast({ message: "Failed to clear upload history", type: "error" });
                      }
                    }}
                    className="px-4 py-2 rounded-lg font-medium bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-sm"
                  >
                    Clear upload history
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {uploadedVideosError && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-3">{uploadedVideosError}</p>
        )}
        {uploadedVideos && (
          <div className="overflow-x-auto">
            {uploadedVideos.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No uploaded videos recorded yet.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                    <th className="p-2 font-semibold">Title</th>
                    <th className="p-2 font-semibold">Video ID</th>
                    <th className="p-2 font-semibold">Job ID</th>
                    <th className="p-2 font-semibold">Uploaded at</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedVideos.map((v, i) => (
                    <tr key={`${v.videoId}-${i}`} className="border-t border-gray-200 dark:border-gray-600">
                      <td className="p-2 max-w-xs truncate" title={v.title}>{v.title}</td>
                      <td className="p-2 font-mono text-xs">
                        <a
                          href={`https://www.youtube.com/watch?v=${v.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {v.videoId}
                        </a>
                      </td>
                      <td className="p-2 font-mono text-xs text-gray-600 dark:text-gray-400">{v.jobId}</td>
                      <td className="p-2 text-gray-600 dark:text-gray-400">{new Date(v.uploadedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {queue.length === 0 && (
        <div className="card border border-gray-100 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
          No jobs in the queue yet. Upload statistics will appear here when you add and run jobs.
        </div>
      )}

      {queue.length > 0 && (
        <>
      {/* Next Upload Timer - Enhanced Countdown */}
      {nextUploadTime && timeUntilNext && (
        <div className="mb-8 p-6 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-2xl shadow-xl text-white relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-5">
                <div className="text-5xl animate-pulse-slow">⏰</div>
                <div>
                  <div className="text-sm opacity-90 mb-1 font-medium uppercase tracking-wide">
                    Next Upload Batch
                  </div>
                  <div className="text-4xl font-bold mb-2 font-mono tracking-tight">
                    {timeUntilNext}
                  </div>
                  <div className="text-sm opacity-90 mt-1">
                    {nextUploadTime.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </div>
                  <div className="text-xs opacity-75 mt-2 flex items-center gap-2">
                    <span>🔄</span>
                    <span>Uploads run every 24 hours</span>
                  </div>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-5xl animate-pulse-slow opacity-80">⏳</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Dashboard */}
      <div className="card border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
            📊 Upload Statistics
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Export statistics as JSON"
              onClick={() => exportStats("json")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white"
            >
              Export (JSON)
            </button>
            <button
              type="button"
              onClick={() => exportStats("csv")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white"
            >
              Export (CSV)
            </button>
            <div
              className={`px-4 py-2 rounded-full text-sm font-semibold ${
                processing > 0
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
              }`}
            >
              {processing > 0 ? "⚡ Processing" : "✓ Ready"}
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">
              Overall Progress
            </span>
            <span className="font-bold text-gray-800 dark:text-white text-lg">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out flex items-center justify-center text-white font-bold text-xs shadow-lg ${
                progressPercentage === 100 
                    ? "bg-gradient-to-r from-green-500 to-emerald-600"
                    : "bg-gradient-to-r from-red-600 via-red-500 to-pink-600"
              }`}
              style={{ width: `${progressPercentage}%` }}
            >
              {progressPercentage > 15 &&
                progressPercentage < 100 &&
                `${progressPercentage}%`}
              {progressPercentage === 100 && "✓ Complete"}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="stat-card group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Total Videos
              </div>
              <div className="text-2xl">📹</div>
            </div>
            <div className="text-4xl font-bold text-gray-800 dark:text-white mb-1">
              {totalVideos}
            </div>
          </div>
          <div className="stat-card bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                Completed
              </div>
              <div className="text-2xl">✅</div>
            </div>
            <div className="text-4xl font-bold text-green-700 dark:text-green-300 mb-1">
              {completed}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                {Math.round((completed / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
          <div className="stat-card bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">
                Processing
              </div>
              <div className="text-2xl animate-pulse-slow">⚡</div>
            </div>
            <div className="text-4xl font-bold text-yellow-700 dark:text-yellow-300 mb-1">
              {pending}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                {Math.round((pending / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
          <div className="stat-card bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-red-200 dark:border-red-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
                Failed
              </div>
              <div className="text-2xl">❌</div>
            </div>
            <div className="text-4xl font-bold text-red-700 dark:text-red-300 mb-1">
              {failed}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                {Math.round((failed / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
        </div>

        {/* Job Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 rounded-xl">
          <div className="text-center">
            <div className="text-3xl font-bold text-indigo-600">
              {queue.length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-teal-600">
              {completedJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-500">
              {processing}
            </div>
            <div className="text-sm text-gray-600 mt-1">Processing</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-500">
              {pendingJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-pink-500">
              {failedJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Failed</div>
          </div>
        </div>

        {/* Remaining Videos */}
        {remaining > 0 && (
          <div
            className={`mt-6 p-4 rounded-lg text-center ${
              remaining > 0
                ? "bg-yellow-50 border border-yellow-300"
                : "bg-green-50 border border-green-300"
            }`}
          >
            <div
              className={`text-lg font-semibold mb-1 ${
                remaining > 0 ? "text-yellow-800" : "text-green-800"
              }`}
            >
              {remaining > 0
                ? `${remaining} videos remaining`
                : "All videos processed!"}
            </div>
            {remaining > 0 && (
              <div className="text-sm text-yellow-700">
                Processing videos...
              </div>
            )}
          </div>
        )}

        {totalVideos === 0 && queue.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-sm text-blue-900">
              Jobs are queued. Statistics will appear once processing begins.
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </>
  );
}


