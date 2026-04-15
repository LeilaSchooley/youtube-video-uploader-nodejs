"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { useCallback, useEffect, useState } from "react";
import type { PythonQueueDetectInfo } from "@/app/components/dashboard/upload-forms-bulk-types";
import { useAppToast } from "@/app/app-toast-context";

export function useDropboxQueueSource(options: {
  setDropboxUploadFolderPath: (path: string) => void;
  setShowDropboxBrowser: (open: boolean) => void;
  hasDropboxAuth: boolean | null;
}) {
  const setShowToast = useAppToast();
  const {
    setDropboxUploadFolderPath,
    setShowDropboxBrowser,
    hasDropboxAuth,
  } = options;

  const [dropboxPythonQueueMode, setDropboxPythonQueueMode] =
    useState<boolean>(false);
  const [pythonQueueDetectInfo, setPythonQueueDetectInfo] =
    useState<PythonQueueDetectInfo | null>(null);

  const refreshQueueSourceConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/queue-source?t=${Date.now()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        success?: boolean;
        sourceType?: string;
        rootPath?: string | null;
      };
      if (
        res.ok &&
        j.success &&
        j.sourceType === "dropbox_python_queue" &&
        j.rootPath
      ) {
        setDropboxPythonQueueMode(true);
        setDropboxUploadFolderPath(j.rootPath);
        try {
          const d2 = await fetch("/api/detect-dropbox-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dropboxPath: j.rootPath }),
          });
          const det = (await d2.json()) as {
            mode?: string;
            manifestCount?: number;
            videoCount?: number;
            thumbnailCount?: number;
            resolvedRoot?: string;
          };
          if (d2.ok && det.mode === "python_queue" && det.resolvedRoot) {
            setPythonQueueDetectInfo({
              manifestCount: det.manifestCount ?? 0,
              videoCount: det.videoCount ?? 0,
              thumbnailCount: det.thumbnailCount ?? 0,
              resolvedRoot: det.resolvedRoot,
            });
          }
        } catch {
          setPythonQueueDetectInfo(null);
        }
      } else {
        setDropboxPythonQueueMode(false);
        setPythonQueueDetectInfo(null);
      }
    } catch {
      /* ignore */
    }
  }, [setDropboxUploadFolderPath]);

  const handleBulkDropboxFolderSelected = useCallback(
    async (folderPath: string, folderName: string) => {
      setDropboxUploadFolderPath(folderPath);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          DASHBOARD_STORAGE.dropboxUploadFolderPath,
          folderPath,
        );
      }
      try {
        const d = await fetch("/api/detect-dropbox-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dropboxPath: folderPath }),
        });
        const data = (await d.json()) as {
          error?: string;
          mode?: string;
          manifestCount?: number;
          videoCount?: number;
          thumbnailCount?: number;
          resolvedRoot?: string;
        };
        if (!d.ok) {
          setShowToast({
            message: data.error || "Folder detection failed",
            type: "error",
          });
          setShowDropboxBrowser(false);
          return;
        }
        if (data.mode === "python_queue" && data.resolvedRoot) {
          await fetch("/api/queue-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceType: "dropbox_python_queue",
              rootPath: data.resolvedRoot,
            }),
          });
          setDropboxPythonQueueMode(true);
          setPythonQueueDetectInfo({
            manifestCount: data.manifestCount ?? 0,
            videoCount: data.videoCount ?? 0,
            thumbnailCount: data.thumbnailCount ?? 0,
            resolvedRoot: data.resolvedRoot,
          });
          setShowToast({
            message: `Python bot queue detected in “${folderName}”: ${data.manifestCount ?? 0} manifest(s), ${data.videoCount ?? 0} video(s), ${data.thumbnailCount ?? 0} thumbnail(s). Worker will read manifests from Dropbox.`,
            type: "success",
          });
        } else {
          await fetch("/api/queue-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceType: "none" }),
          });
          setDropboxPythonQueueMode(false);
          setPythonQueueDetectInfo(null);
          setShowToast({
            message: `Selected folder: ${folderName} (standard Dropbox bulk)`,
            type: "success",
          });
        }
      } catch (e: unknown) {
        setShowToast({
          message:
            e instanceof Error ? e.message : "Could not detect folder layout",
          type: "error",
        });
      }
      setShowDropboxBrowser(false);
    },
    [setShowToast, setDropboxUploadFolderPath, setShowDropboxBrowser],
  );

  const clearDropboxPythonQueueMode = useCallback(async () => {
    try {
      await fetch("/api/queue-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "none" }),
      });
    } catch {
      /* ignore */
    }
    setDropboxPythonQueueMode(false);
    setPythonQueueDetectInfo(null);
  }, []);

  useEffect(() => {
    if (hasDropboxAuth === true) void refreshQueueSourceConfig();
  }, [hasDropboxAuth, refreshQueueSourceConfig]);

  return {
    dropboxPythonQueueMode,
    pythonQueueDetectInfo,
    refreshQueueSourceConfig,
    handleBulkDropboxFolderSelected,
    clearDropboxPythonQueueMode,
  };
}
