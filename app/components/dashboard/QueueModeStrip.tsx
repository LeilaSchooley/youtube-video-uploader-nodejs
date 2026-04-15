"use client";

import { useAppToast } from "@/app/app-toast-context";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type UploadMode = "manual" | "queue";

type StatusPayload = {
  paused: boolean;
  counts: {
    queued: number;
    uploading: number;
    done: number;
    failed: number;
  };
  heartbeat: { lastRunAt: string; jobId?: string } | null;
  python?: {
    enabled: boolean;
    pending: number;
    locked: number;
    processedOnDisk: number;
    failedOnDisk: number;
    videosReady: number;
    videosMissing: number;
  };
  bulk?: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
};

interface QueueModeStripProps {
  fetchQueue: () => Promise<void>;
  onOpenQueueTab?: () => void;
}

export default function QueueModeStrip({
  fetchQueue,
  onOpenQueueTab,
}: QueueModeStripProps) {
  const showAppToast = useAppToast();
  const [mode, setMode] = useState<UploadMode>("manual");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dropboxPythonQueue, setDropboxPythonQueue] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        DASHBOARD_STORAGE.uploadQueueWorkerMode,
      ) as UploadMode | null;
      if (saved === "queue" || saved === "manual") setMode(saved);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persistMode = useCallback((m: UploadMode) => {
    setMode(m);
    try {
      localStorage.setItem(DASHBOARD_STORAGE.uploadQueueWorkerMode, m);
    } catch {
      /* ignore */
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const fetchOpts = { credentials: "include" as const };
      const [stRes, srcRes] = await Promise.all([
        fetch(`/api/queue-worker/status?t=${Date.now()}`, fetchOpts),
        fetch(`/api/queue-source?t=${Date.now()}`, fetchOpts),
      ]);
      const data = await stRes.json();
      if (stRes.ok && !data.error) {
        setStatus(data as StatusPayload);
      }
      if (srcRes.ok) {
        const src = await srcRes.json();
        setDropboxPythonQueue(
          src?.success === true &&
            src?.sourceType === "dropbox_python_queue" &&
            !!src?.rootPath,
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const ms = mode === "queue" ? 2500 : 8000;
    const id = setInterval(loadStatus, ms);
    return () => clearInterval(id);
  }, [mode, loadStatus]);

  const postAction = async (path: "start" | "stop") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/queue-worker/${path}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAppToast({ message: data.message || "OK", type: "success" });
        await loadStatus();
        await fetchQueue();
      } else {
        showAppToast({
          message: data.error || "Request failed",
          type: "error",
        });
      }
    } catch {
      showAppToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  if (!hydrated) {
    return null;
  }

  const paused = status?.paused ?? false;
  const hb = status?.heartbeat;
  const hbRecent =
    !!hb &&
    Date.now() - new Date(hb.lastRunAt).getTime() < 2 * 60 * 1000;
  const py = status?.python;
  const bulk = status?.bulk;

  return (
    <Card className="mb-6 overflow-hidden border-border shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 border-b py-3 px-4">
        <span className="text-sm font-semibold text-foreground">
          Upload source
        </span>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/50">
          <Button
            type="button"
            variant={mode === "manual" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => persistMode("manual")}
            className="rounded-md"
          >
            Manual
          </Button>
          <Button
            type="button"
            variant={mode === "queue" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => persistMode("queue")}
            className="rounded-md"
          >
            Queue mode
          </Button>
        </div>
        {mode === "queue" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl">
            {dropboxPythonQueue ? (
              <>
                Python bot queue is configured from your Dropbox folder (
                <code className="text-[11px]">manifests/</code>,{" "}
                <code className="text-[11px]">videos/</code>,{" "}
                <code className="text-[11px]">thumbnails/</code>). The worker
                reads manifests from Dropbox. Optionally also set{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  PYTHON_QUEUE_ROOT
                </code>{" "}
                on the server for a legacy local queue.
              </>
            ) : (
              <>
                Bot writes JSON + videos under{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  PYTHON_QUEUE_ROOT
                </code>{" "}
                or configure a Dropbox bot folder in Upload Videos; the worker
                reads <code className="text-[11px]">manifests/</code>.
              </>
            )}{" "}
            Use Start/Stop to pause processing only (worker process should stay
            up).
          </p>
        )}
      </CardHeader>

      {mode === "queue" && (
        <CardContent className="space-y-4 p-4">
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm ${
              paused
                ? "border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100"
                : hbRecent
                  ? "border-emerald-300 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100"
                  : "border-gray-200 bg-gray-50/90 text-gray-800 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200"
            }`}
            role="status"
          >
            <div className="font-semibold mb-1">
              Continuous flow (worker)
            </div>
            {paused ? (
              <p>
                <strong>Paused</strong> — the worker will not pick up Python
                manifests or bulk jobs until you click{" "}
                <strong>Start queue upload</strong>.
              </p>
            ) : hbRecent ? (
              <p>
                <strong>Running</strong> — last worker tick{" "}
                {new Date(hb!.lastRunAt).toLocaleTimeString()}. New manifests
                and bulk work are processed on each ~5s tick while the worker
                process stays up.
              </p>
            ) : (
              <p>
                <strong>Not paused</strong>, but <strong>no recent heartbeat</strong>{" "}
                (last tick older than 2 minutes or never). Start the worker with{" "}
                <code className="text-[11px] bg-black/5 dark:bg-white/10 px-1 rounded">
                  npm run worker
                </code>{" "}
                so continuous flow can run.
              </p>
            )}
          </div>

          {py?.enabled && (
            <div
              className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100"
              role="status"
            >
              <div className="font-semibold mb-1">
                Assets in Python / manifest queue
              </div>
              {py.pending > 0 ? (
                <p>
                  <strong>{py.pending}</strong> manifest
                  {py.pending === 1 ? "" : "s"} waiting —{" "}
                  <strong>{py.videosReady ?? 0}</strong> with video file ready
                  to upload, <strong>{py.videosMissing ?? 0}</strong> still
                  waiting on the video file.
                  {py.locked > 0 ? (
                    <span className="block mt-1 text-xs opacity-90">
                      {py.locked} locked (in progress or held).
                    </span>
                  ) : null}
                </p>
              ) : (
                <p>
                  No pending manifests right now (queue folder is clear or
                  everything in view is already processed).{" "}
                  <span className="opacity-90">
                    Processed on disk: {py.processedOnDisk}, failed:{" "}
                    {py.failedOnDisk}.
                  </span>
                </p>
              )}
            </div>
          )}

          {bulk &&
            (bulk.pending > 0 ||
              bulk.processing > 0 ||
              bulk.completed > 0 ||
              bulk.failed > 0) && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Bulk jobs (this session):{" "}
                <strong>{bulk.pending}</strong> pending,{" "}
                <strong>{bulk.processing}</strong> uploading,{" "}
                <strong>{bulk.completed}</strong> completed,{" "}
                <strong>{bulk.failed}</strong> failed.
              </p>
            )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {(
              [
                ["Queued", status?.counts.queued ?? "—"],
                ["Uploading", status?.counts.uploading ?? "—"],
                ["Done", status?.counts.done ?? "—"],
                ["Failed", status?.counts.failed ?? "—"],
              ] as const
            ).map(([label, val]) => (
              <div
                key={label}
                className="rounded-lg border border-gray-100 dark:border-gray-700 py-3 px-2 bg-gray-50/80 dark:bg-gray-900/40"
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {val}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={actionLoading}
              onClick={() => postAction("start")}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Start queue upload
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={actionLoading || paused}
              onClick={() => postAction("stop")}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Stop
            </Button>
            {paused ? (
              <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Paused — no Python or bulk work runs until Start.
              </span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Processing on — worker ticks every ~5s if the process is running.
              </span>
            )}
            {onOpenQueueTab && (
              <Button
                type="button"
                variant="link"
                onClick={onOpenQueueTab}
                className="ml-auto text-violet-600 dark:text-violet-400"
              >
                Queue &amp; Progress →
              </Button>
            )}
          </div>

          {status?.heartbeat && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Last worker tick:{" "}
              {new Date(status.heartbeat.lastRunAt).toLocaleString()}
              {status.heartbeat.jobId && (
                <span className="ml-1 font-mono">
                  ({status.heartbeat.jobId.slice(0, 28)}
                  {status.heartbeat.jobId.length > 28 ? "…" : ""})
                </span>
              )}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
