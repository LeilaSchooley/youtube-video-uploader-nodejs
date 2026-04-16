"use client";

import { useAppToast } from "@/app/app-toast-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { useDropboxAuth } from "./DropboxAuthContext";

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

type DetectApiJson = {
  success?: boolean;
  error?: string;
  found?: boolean;
  path?: string | null;
  manifestCount?: number;
  videoCount?: number;
  thumbnailCount?: number;
  validatedSample?: boolean;
  reason?: string | null;
};

interface QueueModeStripProps {
  fetchQueue: () => Promise<void>;
  onOpenQueueTab?: () => void;
  /** Opens the Upload tab Dropbox folder picker for manual queue root selection. */
  onRequestManualDropboxQueue?: () => void;
}

function readCachedQueuePath(): string | null {
  try {
    const p = localStorage.getItem(
      DASHBOARD_STORAGE.lastDetectedDropboxQueuePath,
    );
    return p?.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

function writeCachedQueuePath(path: string) {
  try {
    localStorage.setItem(
      DASHBOARD_STORAGE.lastDetectedDropboxQueuePath,
      path,
    );
  } catch {
    /* ignore */
  }
}

function clearCachedQueuePath() {
  try {
    localStorage.removeItem(DASHBOARD_STORAGE.lastDetectedDropboxQueuePath);
  } catch {
    /* ignore */
  }
}

export default function QueueModeStrip({
  fetchQueue,
  onOpenQueueTab,
  onRequestManualDropboxQueue,
}: QueueModeStripProps) {
  const showAppToast = useAppToast();
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox } =
    useDropboxAuth();
  const [mode, setMode] = useState<UploadMode>("manual");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dropboxPythonQueue, setDropboxPythonQueue] = useState(false);
  const [queueRootPath, setQueueRootPath] = useState<string | null>(null);
  const [scanningDropbox, setScanningDropbox] = useState(false);
  const [notFoundReason, setNotFoundReason] = useState<string | null>(null);
  const [layoutCounts, setLayoutCounts] = useState<{
    manifestCount: number;
    videoCount: number;
    thumbnailCount: number;
  } | null>(null);

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
        const configured =
          src?.success === true &&
          src?.sourceType === "dropbox_python_queue" &&
          !!src?.rootPath;
        setDropboxPythonQueue(configured);
        setQueueRootPath(configured ? (src.rootPath as string) : null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runAutoDetectRef = useRef<(force: boolean) => Promise<void>>(
    async () => {},
  );

  const runAutoDetect = useCallback(
    async (_force: boolean) => {
      void _force;
      setScanningDropbox(true);
      setNotFoundReason(null);
      try {
        const preferred = readCachedQueuePath();
        const url = preferred
          ? `/api/detect-queue?t=${Date.now()}&preferred=${encodeURIComponent(preferred)}`
          : `/api/detect-queue?t=${Date.now()}`;
        const res = await fetch(url, { credentials: "include" });
        const j = (await res.json()) as DetectApiJson;
        if (!res.ok) {
          showAppToast({
            message: j.error || "Queue detection failed",
            type: "error",
          });
          setNotFoundReason("dropbox_error");
          return;
        }
        if (j.found && j.path) {
          const save = await fetch("/api/queue-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              sourceType: "dropbox_python_queue",
              rootPath: j.path,
            }),
          });
          const saveBody = await save.json();
          if (!save.ok) {
            showAppToast({
              message: saveBody.error || "Could not save queue folder",
              type: "error",
            });
            setNotFoundReason("dropbox_error");
            return;
          }
          writeCachedQueuePath(j.path);
          setLayoutCounts({
            manifestCount: j.manifestCount ?? 0,
            videoCount: j.videoCount ?? 0,
            thumbnailCount: j.thumbnailCount ?? 0,
          });
          setDropboxPythonQueue(true);
          setQueueRootPath(j.path);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new Event("zondiscounts-queue-source-updated"),
            );
          }
          await loadStatus();
          await fetchQueue();
        } else {
          setLayoutCounts(null);
          setNotFoundReason(j.reason || "no_dropbox_queue");
        }
      } catch {
        showAppToast({ message: "Network error during queue scan", type: "error" });
        setNotFoundReason("dropbox_error");
      } finally {
        setScanningDropbox(false);
      }
    },
    [fetchQueue, loadStatus, showAppToast],
  );

  runAutoDetectRef.current = runAutoDetect;

  useEffect(() => {
    loadStatus();
    const ms = mode === "queue" ? 2500 : 8000;
    const id = setInterval(loadStatus, ms);
    return () => clearInterval(id);
  }, [mode, loadStatus]);

  useEffect(() => {
    if (mode !== "queue" || !hydrated) return;
    if (hasDropboxAuth !== true || dropboxAuthLoading) return;

    let cancelled = false;

    const maybeAutoDiscover = async () => {
      try {
        const srcRes = await fetch(`/api/queue-source?t=${Date.now()}`, {
          credentials: "include",
        });
        const src = await srcRes.json();
        if (cancelled) return;
        if (
          src?.success &&
          src?.sourceType === "dropbox_python_queue" &&
          src?.rootPath
        ) {
          setDropboxPythonQueue(true);
          setQueueRootPath(src.rootPath as string);
          setNotFoundReason(null);
          return;
        }
        await runAutoDetectRef.current(false);
      } catch {
        /* ignore */
      }
    };

    void maybeAutoDiscover();
    return () => {
      cancelled = true;
    };
  }, [mode, hydrated, hasDropboxAuth, dropboxAuthLoading]);

  useEffect(() => {
    if (mode !== "queue") {
      setNotFoundReason(null);
      setScanningDropbox(false);
    }
  }, [mode]);

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

  const handleRefreshDetect = () => {
    void runAutoDetect(true);
  };

  const handleChangeFolder = async () => {
    try {
      await fetch("/api/queue-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceType: "none" }),
      });
    } catch {
      /* ignore */
    }
    clearCachedQueuePath();
    setDropboxPythonQueue(false);
    setQueueRootPath(null);
    setLayoutCounts(null);
    setNotFoundReason(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("zondiscounts-queue-source-updated"));
    }
    await loadStatus();
    onRequestManualDropboxQueue?.();
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

  const notFoundMessage =
    notFoundReason === "invalid_manifest_sample"
      ? "Found a manifests folder, but no valid manifest JSON (need title, description, and video path)."
      : notFoundReason === "dropbox_error"
        ? "Dropbox could not be scanned (network or API error). Try again or pick a folder manually."
        : "No queue found at the usual Dropbox paths.";

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
            Dropbox manifest queue: auto-detect{" "}
            <code className="text-[11px]">manifests/</code>,{" "}
            <code className="text-[11px]">videos/</code>,{" "}
            <code className="text-[11px]">thumbnails/</code>. Start/Stop only
            pauses the worker; keep{" "}
            <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">
              npm run worker
            </code>{" "}
            running for uploads.
          </p>
        )}
      </CardHeader>

      {mode === "queue" && (
        <CardContent className="space-y-4 p-4">
          {dropboxAuthLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Checking Dropbox connection…
            </p>
          ) : hasDropboxAuth !== true ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="mb-2 font-medium">Connect Dropbox to use Queue mode.</p>
              <Button type="button" size="sm" onClick={() => void connectDropbox()}>
                Connect Dropbox
              </Button>
            </div>
          ) : (
            <>
              {scanningDropbox ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Scanning Dropbox for queue…
                </p>
              ) : null}

              {dropboxPythonQueue && queueRootPath && !scanningDropbox ? (
                <div
                  className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
                  role="status"
                >
                  <div className="font-semibold mb-1">Queue detected</div>
                  <p className="font-mono text-xs break-all mb-2">{queueRootPath}</p>
                  {layoutCounts ? (
                    <p className="text-xs mb-1">
                      Folder scan:{" "}
                      <strong>{layoutCounts.manifestCount}</strong> manifests,{" "}
                      <strong>{layoutCounts.videoCount}</strong> videos,{" "}
                      <strong>{layoutCounts.thumbnailCount}</strong> thumbnails
                    </p>
                  ) : null}
                  {py?.enabled ? (
                    <p className="text-xs">
                      Ready to upload now:{" "}
                      <strong>{py.videosReady ?? 0}</strong> with video on disk,{" "}
                      <strong>{py.pending}</strong> manifest
                      {py.pending === 1 ? "" : "s"} pending.
                    </p>
                  ) : (
                    <p className="text-xs opacity-90">
                      Worker summary loads after the worker process polls this
                      session.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={scanningDropbox}
                      onClick={handleRefreshDetect}
                    >
                      Refresh scan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={scanningDropbox}
                      onClick={() => void handleChangeFolder()}
                    >
                      Change folder
                    </Button>
                  </div>
                </div>
              ) : null}

              {!dropboxPythonQueue && !scanningDropbox && notFoundReason ? (
                <div
                  className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
                  role="alert"
                >
                  <div className="font-semibold mb-1">No queue found in Dropbox</div>
                  <p className="text-xs mb-2">{notFoundMessage}</p>
                  <p className="text-xs font-mono bg-black/5 dark:bg-white/10 p-2 rounded mb-2">
                    /queue/
                    <br />
                    &nbsp;&nbsp;manifests/
                    <br />
                    &nbsp;&nbsp;videos/
                    <br />
                    &nbsp;&nbsp;thumbnails/
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleRefreshDetect}
                    >
                      Scan again
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onRequestManualDropboxQueue?.()}
                    >
                      Select folder manually
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}

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
