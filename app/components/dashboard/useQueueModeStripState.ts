import { useCallback, useEffect, useRef, useState } from "react";
import type { AppToastPayload } from "@/app/app-toast-context";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { readStorageValue, removeStorageValue, writeStorageValue } from "./dashboard-storage";

type UploadMode = "manual" | "queue";

type StatusPayload = {
  paused: boolean;
  counts: { queued: number; uploading: number; done: number; failed: number };
  heartbeat: { lastRunAt: string; jobId?: string } | null;
  python?: {
    enabled: boolean; pending: number; locked: number; processedOnDisk: number; failedOnDisk: number; videosReady: number; videosMissing: number;
  };
  bulk?: { pending: number; processing: number; completed: number; failed: number };
};

type DetectApiJson = {
  success?: boolean; error?: string; found?: boolean; path?: string | null; manifestCount?: number; videoCount?: number; thumbnailCount?: number; reason?: string | null;
};

type Params = {
  fetchQueue: () => Promise<void>;
  showAppToast: (opts: AppToastPayload) => void;
  hasDropboxAuth: boolean | null;
  dropboxAuthLoading: boolean;
  onRequestManualDropboxQueue?: () => void;
};

export function useQueueModeStripState(params: Params) {
  const { fetchQueue, showAppToast, hasDropboxAuth, dropboxAuthLoading, onRequestManualDropboxQueue } = params;
  const [mode, setMode] = useState<UploadMode>("manual");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dropboxPythonQueue, setDropboxPythonQueue] = useState(false);
  const [queueRootPath, setQueueRootPath] = useState<string | null>(null);
  const [detectedQueuePath, setDetectedQueuePath] = useState<string | null>(null);
  const [detectedLayoutCounts, setDetectedLayoutCounts] = useState<{ manifestCount: number; videoCount: number; thumbnailCount: number } | null>(null);
  const [scanningDropbox, setScanningDropbox] = useState(false);
  const [notFoundReason, setNotFoundReason] = useState<string | null>(null);
  const [layoutCounts, setLayoutCounts] = useState<{ manifestCount: number; videoCount: number; thumbnailCount: number } | null>(null);

  useEffect(() => {
    const saved = readStorageValue(DASHBOARD_STORAGE.uploadQueueWorkerMode) as UploadMode | null;
    if (saved === "queue" || saved === "manual") setMode(saved);
    setHydrated(true);
  }, []);

  const persistMode = useCallback((m: UploadMode) => {
    setMode(m);
    writeStorageValue(DASHBOARD_STORAGE.uploadQueueWorkerMode, m);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const opts = { credentials: "include" as const };
      const [stRes, srcRes] = await Promise.all([fetch(`/api/queue-worker/status?t=${Date.now()}`, opts), fetch(`/api/queue-source?t=${Date.now()}`, opts)]);
      const data = await stRes.json();
      if (stRes.ok && !data.error) setStatus(data as StatusPayload);
      if (srcRes.ok) {
        const src = await srcRes.json();
        const configured = src?.success === true && src?.sourceType === "dropbox_python_queue" && !!src?.rootPath;
        setDropboxPythonQueue(configured);
        setQueueRootPath(configured ? (src.rootPath as string) : null);
        if (configured) {
          setDetectedQueuePath(null);
          setDetectedLayoutCounts(null);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runAutoDetectRef = useRef<(force: boolean) => Promise<void>>(async () => {});
  const runAutoDetect = useCallback(async (_force: boolean) => {
    void _force;
    setScanningDropbox(true);
    setNotFoundReason(null);
    try {
      const preferred = readStorageValue(DASHBOARD_STORAGE.lastDetectedDropboxQueuePath);
      const url = preferred ? `/api/detect-queue?t=${Date.now()}&preferred=${encodeURIComponent(preferred)}` : `/api/detect-queue?t=${Date.now()}`;
      const res = await fetch(url, { credentials: "include" });
      const j = (await res.json()) as DetectApiJson;
      if (!res.ok) {
        showAppToast({ message: j.error || "Queue detection failed", type: "error" });
        setNotFoundReason("dropbox_error");
        return;
      }
      if (j.found && j.path) {
        writeStorageValue(DASHBOARD_STORAGE.lastDetectedDropboxQueuePath, j.path);
        setDetectedQueuePath(j.path);
        setDetectedLayoutCounts({
          manifestCount: j.manifestCount ?? 0,
          videoCount: j.videoCount ?? 0,
          thumbnailCount: j.thumbnailCount ?? 0,
        });
        setLayoutCounts({
          manifestCount: j.manifestCount ?? 0,
          videoCount: j.videoCount ?? 0,
          thumbnailCount: j.thumbnailCount ?? 0,
        });
        setNotFoundReason(null);
        if (_force) {
          showAppToast({
            message: `Queue layout detected at ${j.path}. Click "Use detected queue" to enable it.`,
            type: "info",
          });
        }
      } else {
        setDetectedQueuePath(null);
        setDetectedLayoutCounts(null);
        setLayoutCounts(null);
        setNotFoundReason(j.reason || "no_dropbox_queue");
      }
    } catch {
      showAppToast({ message: "Network error during queue scan", type: "error" });
      setNotFoundReason("dropbox_error");
    } finally {
      setScanningDropbox(false);
    }
  }, [showAppToast]);

  runAutoDetectRef.current = runAutoDetect;

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, mode === "queue" ? 2500 : 8000);
    return () => clearInterval(id);
  }, [mode, loadStatus]);

  useEffect(() => {
    if (mode !== "queue" || !hydrated || hasDropboxAuth !== true || dropboxAuthLoading) return;
    let cancelled = false;
    const maybeAutoDiscover = async () => {
      try {
        const srcRes = await fetch(`/api/queue-source?t=${Date.now()}`, { credentials: "include" });
        const src = await srcRes.json();
        if (cancelled) return;
        if (src?.success && src?.sourceType === "dropbox_python_queue" && src?.rootPath) {
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
    return () => { cancelled = true; };
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
      const res = await fetch(`/api/queue-worker/${path}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok && data.success) {
        showAppToast({ message: data.message || "OK", type: "success" });
        await loadStatus();
        await fetchQueue();
      } else {
        showAppToast({ message: data.error || "Request failed", type: "error" });
      }
    } catch {
      showAppToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeFolder = async () => {
    try {
      await fetch("/api/queue-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceType: "none" }),
      });
    } catch {}
    removeStorageValue(DASHBOARD_STORAGE.lastDetectedDropboxQueuePath);
    setDropboxPythonQueue(false);
    setQueueRootPath(null);
    setDetectedQueuePath(null);
    setDetectedLayoutCounts(null);
    setLayoutCounts(null);
    setNotFoundReason(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("zondiscounts-queue-source-updated"));
    await loadStatus();
    onRequestManualDropboxQueue?.();
  };

  const useDetectedQueue = async () => {
    if (!detectedQueuePath) {
      showAppToast({ message: "No detected queue path to apply", type: "error" });
      return;
    }
    try {
      const save = await fetch("/api/queue-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceType: "dropbox_python_queue",
          rootPath: detectedQueuePath,
        }),
      });
      const saveBody = await save.json();
      if (!save.ok) {
        showAppToast({ message: saveBody.error || "Could not save queue folder", type: "error" });
        return;
      }
      setDropboxPythonQueue(true);
      setQueueRootPath(detectedQueuePath);
      setLayoutCounts(detectedLayoutCounts);
      setDetectedQueuePath(null);
      setDetectedLayoutCounts(null);
      setNotFoundReason(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("zondiscounts-queue-source-updated"));
      }
      await loadStatus();
      await fetchQueue();
      showAppToast({ message: "Queue source enabled", type: "success" });
    } catch {
      showAppToast({ message: "Could not enable detected queue", type: "error" });
    }
  };

  return {
    mode, hydrated, status, actionLoading, dropboxPythonQueue, queueRootPath, detectedQueuePath, detectedLayoutCounts, scanningDropbox, notFoundReason, layoutCounts,
    persistMode, runAutoDetect, postAction, handleChangeFolder, useDetectedQueue,
  };
}
