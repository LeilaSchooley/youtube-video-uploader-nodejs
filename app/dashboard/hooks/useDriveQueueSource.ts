"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { useCallback, useEffect, useState } from "react";
import type { PythonQueueDetectInfo } from "@/app/components/dashboard/upload-forms-bulk-types";
import { useAppToast } from "@/app/app-toast-context";

export function useDriveQueueSource(options: {
  setDriveUploadFolderId: (id: string) => void;
  setDriveUploadFolderName: (name: string) => void;
  setShowDriveBrowser: (open: boolean) => void;
  hasGoogleDriveAuth: boolean | null;
}) {
  const setShowToast = useAppToast();
  const {
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setShowDriveBrowser,
    hasGoogleDriveAuth,
  } = options;

  const [drivePythonQueueMode, setDrivePythonQueueMode] = useState(false);
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
        j.sourceType === "drive_python_queue" &&
        j.rootPath
      ) {
        setDrivePythonQueueMode(true);
        setDriveUploadFolderId(j.rootPath);
        try {
          const d2 = await fetch("/api/detect-drive-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ driveFolderId: j.rootPath }),
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
      } else if (j.sourceType !== "drive_python_queue") {
        setDrivePythonQueueMode(false);
        setPythonQueueDetectInfo(null);
      }
    } catch {
      /* ignore */
    }
  }, [setDriveUploadFolderId]);

  const handleBulkDriveFolderSelected = useCallback(
    async (folderId: string, folderName: string) => {
      setDriveUploadFolderId(folderId);
      setDriveUploadFolderName(folderName);
      if (typeof window !== "undefined") {
        localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, folderId);
        localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderName, folderName);
      }
      try {
        const d = await fetch("/api/detect-drive-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ driveFolderId: folderId }),
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
          setShowDriveBrowser(false);
          return;
        }
        if (data.mode === "python_queue" && data.resolvedRoot) {
          await fetch("/api/queue-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              sourceType: "drive_python_queue",
              rootPath: data.resolvedRoot,
            }),
          });
          setDrivePythonQueueMode(true);
          setDriveUploadFolderId(data.resolvedRoot);
          setPythonQueueDetectInfo({
            manifestCount: data.manifestCount ?? 0,
            videoCount: data.videoCount ?? 0,
            thumbnailCount: data.thumbnailCount ?? 0,
            resolvedRoot: data.resolvedRoot,
          });
          setShowToast({
            message: `Python bot queue detected in “${folderName}”: ${data.manifestCount ?? 0} manifest(s), ${data.videoCount ?? 0} video(s), ${data.thumbnailCount ?? 0} thumbnail(s). Worker will read manifests from Google Drive.`,
            type: "success",
          });
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("zondiscounts-queue-source-updated"),
            );
          }
        } else {
          await fetch("/api/queue-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ sourceType: "none" }),
          });
          setDrivePythonQueueMode(false);
          setPythonQueueDetectInfo(null);
          setShowToast({
            message: `Selected folder: ${folderName} (standard Drive bulk)`,
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
      setShowDriveBrowser(false);
    },
    [
      setShowToast,
      setDriveUploadFolderId,
      setDriveUploadFolderName,
      setShowDriveBrowser,
    ],
  );

  const clearDrivePythonQueueMode = useCallback(async () => {
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
    setDrivePythonQueueMode(false);
    setPythonQueueDetectInfo(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zondiscounts-queue-source-updated"));
    }
  }, []);

  useEffect(() => {
    if (hasGoogleDriveAuth === true) void refreshQueueSourceConfig();
  }, [hasGoogleDriveAuth, refreshQueueSourceConfig]);

  useEffect(() => {
    const onExternal = () => {
      if (hasGoogleDriveAuth === true) void refreshQueueSourceConfig();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("zondiscounts-queue-source-updated", onExternal);
    return () =>
      window.removeEventListener(
        "zondiscounts-queue-source-updated",
        onExternal,
      );
  }, [hasGoogleDriveAuth, refreshQueueSourceConfig]);

  return {
    drivePythonQueueMode,
    pythonQueueDetectInfo,
    refreshQueueSourceConfig,
    handleBulkDriveFolderSelected,
    clearDrivePythonQueueMode,
  };
}
