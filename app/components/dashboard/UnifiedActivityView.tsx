"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAppToast } from "@/app/app-toast-context";
import { dashboardQueryKeys } from "@/lib/dashboard-queries";
import type { ManifestQueueRow } from "@/lib/manifest-queue-list";
import { MANIFEST_MAX_AUTO_RETRIES } from "@/lib/manifest-upload-constants";
import type { BulkJob } from "./types";

const manifestQueueQueryKey = ["manifest-queue"] as const;

interface ManifestQueueApiResponse {
  success: boolean;
  queueRoot?: string;
  rows?: ManifestQueueRow[];
  error?: string;
}

interface UnifiedActivityViewProps {
  queue: BulkJob[];
  searchQuery: string;
  /** Dropbox bot queue saved for this session — enables manifest rows from /api/manifest-queue */
  manifestVisible: boolean;
  selectedBulkJobId: string | null;
  setSelectedBulkJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
}

function bulkJobSummary(job: BulkJob): {
  label: string;
  progressLine: string;
  displayStatus: string;
} {
  const jobProgress = job.progress || [];
  const completedCount = jobProgress.filter(
    (p) =>
      p &&
      (p.videoId ||
        (p.status &&
          (p.status.includes("Uploaded") ||
            p.status.includes("Completed") ||
            p.status.includes("Scheduled") ||
            p.status.includes("scheduled") ||
            p.status.includes("Already uploaded")))),
  ).length;
  const failedCount = jobProgress.filter(
    (p) =>
      p &&
      p.status &&
      (p.status.includes("Failed") ||
        p.status.includes("Missing") ||
        p.status.includes("Invalid")),
  ).length;
  const totalVideos = job.totalVideos || jobProgress.length || 0;
  const pendingCount = Math.max(0, totalVideos - completedCount - failedCount);
  const displayStatus =
    pendingCount > 0 && job.status === "completed" ? "processing" : job.status;
  const firstTitle =
    job.items?.[0]?.title ||
    job.items?.[0]?.file?.name ||
    job.dropboxSheetName ||
    job.dropboxCsvPath?.split("/").pop();
  const label = firstTitle
    ? `${firstTitle.length > 48 ? `${firstTitle.slice(0, 45)}…` : firstTitle}`
    : job.id;
  const progressLine =
    totalVideos > 0
      ? `${completedCount}/${totalVideos} done${failedCount ? ` · ${failedCount} failed` : ""}`
      : job.type || "—";
  return { label, progressLine, displayStatus };
}

function ManifestStatusCell({ row }: { row: ManifestQueueRow }) {
  if (row.terminal) {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400" title={row.last_error}>
        <span className="text-lg leading-none">🔴</span>
        <span>Failed (max retries)</span>
      </span>
    );
  }
  if (row.upload_status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-orange-700 dark:text-orange-300" title={row.last_error}>
        <span className="text-lg leading-none">🟡</span>
        <span>Failed (will retry)</span>
      </span>
    );
  }
  if (row.upload_status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-gray-500">
        <span className="text-lg leading-none">✓</span>
        <span>Done</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
      <span className="text-lg leading-none">🟢</span>
      <span>Ready</span>
    </span>
  );
}

function ManifestActionCell({
  row,
  busy,
  onRetry,
  onDelete,
}: {
  row: ManifestQueueRow;
  busy: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  if (row.terminal) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Delete this failed manifest from Dropbox?")) onDelete();
        }}
        className="text-sm px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
      >
        Delete
      </button>
    );
  }
  if (row.upload_status === "failed") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className="text-sm px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Retry
      </button>
    );
  }
  if (row.upload_status === "done") {
    return <span className="text-xs text-gray-500 dark:text-gray-400">—</span>;
  }
  return (
    <span
      className="text-xs text-gray-500 dark:text-gray-400"
      title="Worker uploads on schedule"
    >
      Worker
    </span>
  );
}

export default function UnifiedActivityView({
  queue,
  searchQuery,
  manifestVisible,
  selectedBulkJobId,
  setSelectedBulkJobId,
  fetchJobStatus,
  fetchQueue,
}: UnifiedActivityViewProps) {
  const showToast = useAppToast();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(true); // Start collapsed

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: manifestQueueQueryKey,
    queryFn: async (): Promise<ManifestQueueApiResponse> => {
      const res = await fetch("/api/manifest-queue", { credentials: "include" });
      const json = (await res.json()) as ManifestQueueApiResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Could not load manifest jobs");
      }
      return json;
    },
    enabled: manifestVisible,
    /** Slower than bulk queue polling to reduce Dropbox 429 bursts while listing manifests. */
    refetchInterval: manifestVisible ? 8000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (manifestPath: string) => {
      const res = await fetch("/api/manifest-queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "retry", manifestPath }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Retry failed");
      }
    },
    onSuccess: async () => {
      showToast({ message: "Manifest reset to queued", type: "success" });
      await queryClient.invalidateQueries({ queryKey: manifestQueueQueryKey });
      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.queueBundle,
      });
    },
    onError: (e: Error) => {
      showToast({
        message: e.message || "Could not retry manifest",
        type: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (manifestPath: string) => {
      const res = await fetch("/api/manifest-queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", manifestPath }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Delete failed");
      }
    },
    onSuccess: async () => {
      showToast({ message: "Manifest deleted", type: "success" });
      await queryClient.invalidateQueries({ queryKey: manifestQueueQueryKey });
      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.queueBundle,
      });
    },
    onError: (e: Error) => {
      showToast({
        message: e.message || "Could not delete manifest",
        type: "error",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/manifest-queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete-all" }),
      });
      const json = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) {
        throw new Error(json.error || "Delete all failed");
      }
      return json;
    },
    onSuccess: async (data) => {
      const count = data.deleted ?? 0;
      showToast({
        message: `Deleted ${count} terminal manifest${count !== 1 ? "s" : ""}`,
        type: "success",
      });
      await queryClient.invalidateQueries({ queryKey: manifestQueueQueryKey });
      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.queueBundle,
      });
    },
    onError: (e: Error) => {
      showToast({
        message: e.message || "Could not delete all manifests",
        type: "error",
      });
    },
  });

  const exportFailedCsv = async () => {
    try {
      const res = await fetch("/api/manifest-queue/export?status=failed", {
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `manifest-failed-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({
        message: "Exported failed manifest rows (CSV)",
        type: "success",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Export failed";
      showToast({ message: msg, type: "error" });
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const bulkJobs = queue.filter((job) => {
    if (!q) return true;
    return (
      job.id.toLowerCase().includes(q) ||
      job.status.toLowerCase().includes(q) ||
      (job.items?.some(
        (it) =>
          (it.title && it.title.toLowerCase().includes(q)) ||
          (it.file?.name && it.file.name.toLowerCase().includes(q)),
      ) ??
        false)
    );
  });

  const manifestRows = data?.rows ?? [];
  const manifestFiltered = q
    ? manifestRows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.manifestPath.toLowerCase().includes(q) ||
          r.videoPath.toLowerCase().includes(q),
      )
    : manifestRows;

  const errMsg = isError && error instanceof Error ? error.message : null;
  const hasBulk = bulkJobs.length > 0;
  const hasManifest = manifestFiltered.length > 0;
  const showManifestBlock = manifestVisible;
  const tableHasRows = hasBulk || (showManifestBlock && hasManifest);
  const manifestLoading = manifestVisible && isLoading;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            {showManifestBlock && (
              <span className="text-lg leading-none">{collapsed ? "▶" : "▼"}</span>
            )}
            Activity
            {showManifestBlock && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">
                {isFetching ? "⟳ auto-refreshing" : collapsed ? "(collapsed)" : "(expanded)"}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-2xl">
            Bulk upload jobs and Dropbox manifest jobs in one place. Select a
            bulk row to open file-level details below. Upload history and charts
            are on this same tab (scroll down).
          </p>
          {data?.queueRoot ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
              Dropbox queue: {data.queueRoot}
              {isFetching ? " · refreshing…" : ""}
            </div>
          ) : null}
        </div>
        {showManifestBlock ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void exportFailedCsv()}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 inline-flex items-center gap-1.5"
            >
              <span>📥</span>
              Export failed manifests (CSV)
            </button>
            {(data?.rows ?? []).some((r) => r.terminal) && (
              <button
                type="button"
                disabled={deleteAllMutation.isPending}
                onClick={() => {
                  const count = (data?.rows ?? []).filter((r) => r.terminal).length;
                  if (
                    confirm(
                      `Delete all ${count} terminal (failed) manifest${count !== 1 ? "s" : ""}? This cannot be undone.`
                    )
                  ) {
                    void deleteAllMutation.mutate();
                  }
                }}
                className="text-sm px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <span>🗑️</span>
                {deleteAllMutation.isPending
                  ? "Deleting…"
                  : `Delete all (${(data?.rows ?? []).filter((r) => r.terminal).length})`}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {!collapsed && (
        <>
          {errMsg && (
            <div className="px-4 py-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
              Manifest queue error: {errMsg}
            </div>
          )}
          {manifestLoading && !hasBulk ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
              Loading manifest jobs…
            </div>
          ) : !tableHasRows && !manifestLoading ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              No bulk jobs yet
              {showManifestBlock ? (
                <>
                  {" "}
                  and no manifest JSON files in{" "}
                  <code className="text-xs">manifests/</code>
                </>
              ) : null}
              . Add a bulk upload from Upload Videos, or configure a Dropbox bot
              folder with manifests.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium w-28">Source</th>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Progress / detail</th>
                    <th className="px-4 py-2 font-medium w-36">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {bulkJobs.map((job) => {
                    const { label, progressLine, displayStatus } =
                      bulkJobSummary(job);
                    const selected = selectedBulkJobId === job.id;
                    return (
                      <tr
                        key={job.id}
                        onClick={() => {
                          setSelectedBulkJobId(job.id);
                          void fetchJobStatus(job.id);
                          void fetchQueue();
                        }}
                        className={`text-gray-800 dark:text-gray-200 cursor-pointer ${
                          selected
                            ? "bg-blue-50/90 dark:bg-blue-950/40"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        }`}
                      >
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 px-2 py-0.5 text-xs font-medium">
                            Bulk
                          </span>
                        </td>
                        <td className="px-4 py-2 max-w-[220px]">
                          <div className="truncate font-medium" title={label}>
                            {label}
                          </div>
                          <div
                            className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate"
                            title={job.id}
                          >
                            {job.id}
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap capitalize">
                          {displayStatus}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                          {progressLine}
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-indigo-600 dark:text-indigo-400 text-sm font-medium">
                            Details →
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {showManifestBlock &&
                    manifestFiltered.map((r) => (
                      <tr
                        key={r.manifestPath}
                        className="text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 px-2 py-0.5 text-xs font-medium">
                            Manifest
                          </span>
                        </td>
                        <td className="px-4 py-2 max-w-[220px]">
                          <div className="truncate font-medium" title={r.title}>
                            {r.title}
                          </div>
                          <div
                            className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono"
                            title={r.manifestPath}
                          >
                            {r.manifestPath.split("/").pop()}
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <ManifestStatusCell row={r} />
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              r.videoReady
                                ? "text-green-700 dark:text-green-400"
                                : "text-amber-700 dark:text-amber-300"
                            }
                          >
                            Video {r.videoReady ? "ready" : "missing"}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 ml-2">
                            · retries {r.retry_count}/{MANIFEST_MAX_AUTO_RETRIES}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <ManifestActionCell
                            row={r}
                            busy={retryMutation.isPending || deleteMutation.isPending}
                            onRetry={() => retryMutation.mutate(r.manifestPath)}
                            onDelete={() => deleteMutation.mutate(r.manifestPath)}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
