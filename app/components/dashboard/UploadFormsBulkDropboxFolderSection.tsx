"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  hasDropboxAuth: boolean | null;
  dropboxAuthLoading: boolean;
  connectDropbox: () => Promise<void>;
  dropboxPythonQueueMode: boolean;
  pythonQueueDetectInfo: any;
  dropboxUploadFolderPath: string;
  setDropboxUploadFolderPath: (v: string) => void;
  setDropboxBrowserMode: (v: "folder" | "file") => void;
  setDropboxBrowserContext: (v: "bulk" | "sheets-folder" | "sheets-file" | "thumbnails-folder") => void;
  setShowDropboxBrowser: (v: boolean) => void;
  clearDropboxPythonQueueMode: () => Promise<void>;
  skipDuplicateTitles: boolean;
  setSkipDuplicateTitles: (v: boolean) => void;
};

export default function UploadFormsBulkDropboxFolderSection(props: Props) {
  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📦</span>
        <div className="flex-1">
          <strong className="text-blue-900 dark:text-blue-100 block mb-1">Upload from Dropbox Folder</strong>
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
            {props.dropboxPythonQueueMode
              ? "Python bot queue: manifests, videos, and thumbnails live in Dropbox. The worker uploads from JSON manifests — no standard bulk job is required."
              : "Upload all videos from a Dropbox folder. Supports recursive folder scanning and post-upload actions."}
          </p>
          {props.dropboxPythonQueueMode && props.pythonQueueDetectInfo && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 text-sm text-emerald-950 dark:text-emerald-100">
              <strong>Detected bot queue</strong> at <span className="font-mono text-xs">{props.pythonQueueDetectInfo.resolvedRoot}</span>: {props.pythonQueueDetectInfo.manifestCount} manifest(s), {props.pythonQueueDetectInfo.videoCount} video(s), {props.pythonQueueDetectInfo.thumbnailCount} thumbnail(s).
            </div>
          )}
          {props.hasDropboxAuth !== true && (
            <div className="mb-3 p-3 bg-blue-100 dark:bg-blue-800/50 border border-blue-300 dark:border-blue-600 rounded-lg text-sm text-blue-900 dark:text-blue-100">
              {props.dropboxAuthLoading || props.hasDropboxAuth === null ? (
                <p className="text-gray-700 dark:text-gray-300 animate-pulse">Checking Dropbox connection…</p>
              ) : (
                <p>
                  Connect Dropbox from the <strong className="whitespace-nowrap">page header</strong> to use folders and Browse, or{" "}
                  <button type="button" onClick={() => void props.connectDropbox()} className="font-semibold underline underline-offset-2 hover:opacity-90">connect here</button>.
                </p>
              )}
            </div>
          )}
          <div className={props.hasDropboxAuth !== true ? "opacity-50 pointer-events-none" : ""}>
            <div className="flex gap-2">
              <input
                type="text"
                id="dropboxFolderPath"
                name="dropboxFolderPath"
                placeholder="/Videos or /My Videos/Uploads"
                value={props.dropboxUploadFolderPath}
                onChange={(e) => {
                  props.setDropboxUploadFolderPath(e.target.value);
                  if (typeof window !== "undefined") {
                    if (e.target.value) localStorage.setItem(DASHBOARD_STORAGE.dropboxUploadFolderPath, e.target.value);
                    else localStorage.removeItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
                  }
                }}
                className="input-field flex-1 font-mono text-sm"
              />
              <button type="button" onClick={() => { props.setDropboxBrowserMode("folder"); props.setDropboxBrowserContext("bulk"); props.setShowDropboxBrowser(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors" disabled={props.hasDropboxAuth !== true}>📂 Browse</button>
              {props.dropboxUploadFolderPath && (
                <button
                  type="button"
                  onClick={() => {
                    props.setDropboxUploadFolderPath("");
                    const input = document.getElementById("dropboxFolderPath") as HTMLInputElement;
                    if (input) input.value = "";
                    if (typeof window !== "undefined") localStorage.removeItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
                    void props.clearDropboxPythonQueueMode();
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {!props.dropboxPythonQueueMode && (
              <>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200"><input type="checkbox" id="dropboxRecursive" className="rounded" />Scan subfolders recursively</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="dropboxPostAction" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">Post-upload action:</label>
                      <select id="dropboxPostAction" className="input-field text-sm py-1" defaultValue="none" onChange={(e) => document.getElementById("dropboxMoveFolder")?.classList.toggle("hidden", e.target.value !== "move")}>
                        <option value="none">None</option><option value="rename">Rename to video ID</option><option value="delete">Delete from Dropbox</option><option value="move">Move to folder</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="dropboxPrivacy" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">Privacy:</label>
                      <select id="dropboxPrivacy" className="input-field text-sm py-1" defaultValue="public">
                        <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
                      </select>
                    </div>
                  </div>
                  <div id="dropboxMoveFolder" className="hidden">
                    <label htmlFor="dropboxCompletedFolder" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">Completed folder path (for move action):</label>
                    <input type="text" id="dropboxCompletedFolder" placeholder="/Completed or /Uploaded" className="input-field text-sm font-mono" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200 mt-2">
                    <input
                      type="checkbox"
                      checked={props.skipDuplicateTitles}
                      onChange={(e) => {
                        const v = e.target.checked;
                        props.setSkipDuplicateTitles(v);
                        if (typeof window !== "undefined") localStorage.setItem(DASHBOARD_STORAGE.dropboxSkipDuplicateTitles, String(v));
                      }}
                      className="rounded"
                    />
                    Skip videos already on channel (by title)
                  </label>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  💡 Enter Dropbox folder path starting with <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/</code> (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/Videos</code> or <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/My Videos/Uploads</code>)
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
