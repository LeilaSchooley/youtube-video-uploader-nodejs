"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  driveUploadFolderId: string;
  setDriveUploadFolderId: (id: string) => void;
  setDriveUploadFolderName: (name: string) => void;
  setDriveBrowserContext: (
    ctx: "drive" | "sheets" | "metadata-csv" | "thumbnails",
  ) => void;
  setDriveBrowserMode: (mode: "folder" | "file") => void;
  setShowDriveBrowser: (show: boolean) => void;
  hasGoogleDriveAuth: boolean | null;
  driveAuthLoading: boolean;
  connectGoogleDrive: () => Promise<void>;
  drivePythonQueueMode: boolean;
  drivePythonQueueDetectInfo: {
    manifestCount: number;
    videoCount: number;
    thumbnailCount: number;
    resolvedRoot: string;
  } | null;
  clearDrivePythonQueueMode: () => Promise<void>;
};

export default function UploadFormsBulkDriveFolderSection(props: Props) {
  const {
    driveUploadFolderId,
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setDriveBrowserContext,
    setDriveBrowserMode,
    setShowDriveBrowser,
    hasGoogleDriveAuth,
    driveAuthLoading,
    connectGoogleDrive,
  } = props;
  return (
    <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📁</span>
        <div className="flex-1">
          <strong className="text-green-900 dark:text-green-100 block mb-1">Upload from Google Drive Folder</strong>
          <p className="text-sm text-green-800 dark:text-green-200 mb-3">
            {props.drivePythonQueueMode
              ? "Python bot queue: manifests, videos, and thumbnails live in Google Drive. The worker uploads from JSON manifests — no standard bulk job is required."
              : "Upload all videos from a Google Drive folder. Supports recursive folder scanning and post-upload actions."}
          </p>
          {props.drivePythonQueueMode && props.drivePythonQueueDetectInfo && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 text-sm text-emerald-950 dark:text-emerald-100">
              <strong>Detected bot queue</strong> (folder{" "}
              <span className="font-mono text-xs">{props.drivePythonQueueDetectInfo.resolvedRoot}</span>
              ): {props.drivePythonQueueDetectInfo.manifestCount} manifest(s),{" "}
              {props.drivePythonQueueDetectInfo.videoCount} video(s),{" "}
              {props.drivePythonQueueDetectInfo.thumbnailCount} thumbnail(s).
            </div>
          )}
          {hasGoogleDriveAuth !== true && (
            <div className="mb-3 p-3 bg-green-100 dark:bg-green-800/50 border border-green-300 dark:border-green-600 rounded-lg text-sm text-green-900 dark:text-green-100">
              {driveAuthLoading || hasGoogleDriveAuth === null ? (
                <p className="text-gray-700 dark:text-gray-300 animate-pulse">Checking Google Drive connection…</p>
              ) : (
                <p>
                  Connect <strong className="whitespace-nowrap">Google Drive</strong> in the header Cloud storage box (Dropbox is the other column), or{" "}
                  <button type="button" onClick={() => void connectGoogleDrive()} className="font-semibold underline underline-offset-2 hover:opacity-90">connect here</button>.
                </p>
              )}
            </div>
          )}
          <div className={hasGoogleDriveAuth !== true ? "opacity-50 pointer-events-none" : ""}>
          <div className="flex gap-2">
            <input
              type="text"
              id="driveFolderId"
              name="driveFolderId"
              placeholder="Enter Drive folder ID or click Browse"
              value={driveUploadFolderId}
              onChange={(e) => {
                setDriveUploadFolderId(e.target.value);
                if (typeof window !== "undefined") {
                  if (e.target.value) localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, e.target.value);
                  else {
                    localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderId);
                    localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderName);
                  }
                }
              }}
              className="input-field flex-1 font-mono text-sm"
            />
            <button type="button" onClick={() => { setDriveBrowserContext("drive"); setDriveBrowserMode("folder"); setShowDriveBrowser(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">📂 Browse</button>
            {driveUploadFolderId && (
              <button
                type="button"
                onClick={() => {
                  setDriveUploadFolderId("");
                  setDriveUploadFolderName("");
                  const input = document.getElementById("driveFolderId") as HTMLInputElement;
                  if (input) input.value = "";
                  if (typeof window !== "undefined") {
                    localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderId);
                    localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderName);
                  }
                  void props.clearDrivePythonQueueMode();
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                ✕ Clear
              </button>
            )}
          </div>
          {!props.drivePythonQueueMode && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
              <input type="checkbox" id="driveRecursive" className="rounded" />
              Scan subfolders recursively
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="drivePostAction" className="text-xs text-green-700 dark:text-green-300 block mb-1">Post-upload action:</label>
                <select id="drivePostAction" className="input-field text-sm py-1" defaultValue="none" onChange={(e) => document.getElementById("driveMoveFolder")?.classList.toggle("hidden", e.target.value !== "move")}>
                  <option value="none">None</option>
                  <option value="rename">Rename to video ID</option>
                  <option value="delete">Delete from Drive</option>
                  <option value="move">Move to folder</option>
                </select>
              </div>
              <div>
                <label htmlFor="drivePrivacy" className="text-xs text-green-700 dark:text-green-300 block mb-1">Privacy:</label>
                <select id="drivePrivacy" className="input-field text-sm py-1" defaultValue="public">
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
            <div id="driveMoveFolder" className="hidden">
              <label htmlFor="driveCompletedFolder" className="text-xs text-green-700 dark:text-green-300 block mb-1">Completed folder ID (for move action):</label>
              <input type="text" id="driveCompletedFolder" placeholder="Enter folder ID" className="input-field text-sm font-mono" />
            </div>
          </div>
          )}
          </div>
          <p className="text-xs text-green-700 dark:text-green-300 mt-2">
            {props.drivePythonQueueMode
              ? "The worker processes manifests from Drive automatically. Clear the folder to switch back to standard bulk upload."
              : (
                <>
            Use the green <strong>Upload from Drive folder</strong> button below after choosing options. Browse or paste folder ID from{" "}
            <code className="bg-green-100 dark:bg-green-800 px-1 rounded">drive.google.com/drive/folders/FOLDER_ID</code>
                </>
              )}
          </p>
        </div>
      </div>
    </div>
  );
}
