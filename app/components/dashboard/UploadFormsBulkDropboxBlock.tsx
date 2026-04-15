"use client";

import { useAppToast } from "@/app/app-toast-context";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import { useDropboxAuth } from "./DropboxAuthContext";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "dropboxPythonQueueMode"
  | "pythonQueueDetectInfo"
  | "dropboxUploadFolderPath"
  | "setDropboxUploadFolderPath"
  | "setDropboxBrowserMode"
  | "setDropboxBrowserContext"
  | "setShowDropboxBrowser"
  | "clearDropboxPythonQueueMode"
  | "skipDuplicateTitles"
  | "setSkipDuplicateTitles"
  | "dropboxThumbnailsFolderPath"
  | "setDropboxThumbnailsFolderPath"
  | "selectedDropboxCsvFile"
  | "setSelectedDropboxCsvFile"
  | "dropboxSheetNames"
  | "setDropboxSheetNames"
  | "loadingDropboxSheets"
  | "selectedDropboxSheetName"
  | "setSelectedDropboxSheetName"
  | "dropboxUploading"
  | "setDropboxUploading"
  | "schedulingEnabled"
  | "globalVideosPerDay"
  | "checkDuplicatesBeforeUpload"
  | "setSelectedJobId"
  | "fetchJobStatus"
  | "fetchQueue"
>;

export default function UploadFormsBulkDropboxBlock(props: Props) {
  const showAppToast = useAppToast();
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox } =
    useDropboxAuth();
  const {
    uploadSource,
    dropboxPythonQueueMode,
    pythonQueueDetectInfo,
    dropboxUploadFolderPath,
    setDropboxUploadFolderPath,
    setDropboxBrowserMode,
    setDropboxBrowserContext,
    setShowDropboxBrowser,
    clearDropboxPythonQueueMode,
    skipDuplicateTitles,
    setSkipDuplicateTitles,
    dropboxThumbnailsFolderPath,
    setDropboxThumbnailsFolderPath,
    selectedDropboxCsvFile,
    setSelectedDropboxCsvFile,
    dropboxSheetNames,
    setDropboxSheetNames,
    loadingDropboxSheets,
    selectedDropboxSheetName,
    setSelectedDropboxSheetName,
    dropboxUploading,
    setDropboxUploading,
    schedulingEnabled,
    globalVideosPerDay,
    checkDuplicatesBeforeUpload,
    setSelectedJobId,
    fetchJobStatus,
    fetchQueue,
  } = props;

  return (
    <>
      {/* Dropbox Folder Upload */}
      {(uploadSource === "dropbox" || HIDE_GOOGLE_DRIVE_SHEETS) && (
  <>
    <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📦</span>
        <div className="flex-1">
          <strong className="text-blue-900 dark:text-blue-100 block mb-1">
            Upload from Dropbox Folder
          </strong>
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
            {dropboxPythonQueueMode
              ? "Python bot queue: manifests, videos, and thumbnails live in Dropbox. The worker uploads from JSON manifests — no standard bulk job is required."
              : "Upload all videos from a Dropbox folder. Supports recursive folder scanning and post-upload actions."}
          </p>
          {dropboxPythonQueueMode && pythonQueueDetectInfo && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 text-sm text-emerald-950 dark:text-emerald-100">
              <strong>Detected bot queue</strong> at{" "}
              <span className="font-mono text-xs">
                {pythonQueueDetectInfo.resolvedRoot}
              </span>
              : {pythonQueueDetectInfo.manifestCount} manifest(s),{" "}
              {pythonQueueDetectInfo.videoCount} video(s),{" "}
              {pythonQueueDetectInfo.thumbnailCount} thumbnail(s).
              Use <strong>Queue mode</strong> below and{" "}
              <strong>Start queue upload</strong> so the worker
              runs.
            </div>
          )}
          {/* Auth overlay - shown over the form when not authenticated */}
          {hasDropboxAuth !== true && (
            <div className="mb-3 p-3 bg-blue-100 dark:bg-blue-800/50 border border-blue-300 dark:border-blue-600 rounded-lg text-sm text-blue-900 dark:text-blue-100">
              {dropboxAuthLoading || hasDropboxAuth === null ? (
                <p className="text-gray-700 dark:text-gray-300 animate-pulse">
                  Checking Dropbox connection…
                </p>
              ) : (
                <p>
                  Connect Dropbox from the{" "}
                  <strong className="whitespace-nowrap">page header</strong> to
                  use folders and Browse, or{" "}
                  <button
                    type="button"
                    onClick={() => void connectDropbox()}
                    className="font-semibold underline underline-offset-2 hover:opacity-90"
                  >
                    connect here
                  </button>
                  .
                </p>
              )}
            </div>
          )}

          {/* Always render the form inputs so values persist */}
          <div
            className={
              hasDropboxAuth !== true
                ? "opacity-50 pointer-events-none"
                : ""
            }
          >
            <div className="flex gap-2">
              <input
                type="text"
                id="dropboxFolderPath"
                name="dropboxFolderPath"
                placeholder="/Videos or /My Videos/Uploads"
                value={dropboxUploadFolderPath}
                onChange={(e) => {
                  setDropboxUploadFolderPath(e.target.value);
                  if (typeof window !== "undefined") {
                    if (e.target.value) {
                      localStorage.setItem(
                        DASHBOARD_STORAGE.dropboxUploadFolderPath,
                        e.target.value,
                      );
                    } else {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.dropboxUploadFolderPath,
                      );
                    }
                  }
                }}
                className="input-field flex-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setDropboxBrowserMode("folder");
                  setDropboxBrowserContext("bulk");
                  setShowDropboxBrowser(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                disabled={hasDropboxAuth !== true}
              >
                📂 Browse
              </button>
              {dropboxUploadFolderPath && (
                <button
                  type="button"
                  onClick={() => {
                    setDropboxUploadFolderPath("");
                    const input = document.getElementById(
                      "dropboxFolderPath",
                    ) as HTMLInputElement;
                    if (input) input.value = "";
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.dropboxUploadFolderPath,
                      );
                    }
                    void clearDropboxPythonQueueMode();
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {!dropboxPythonQueueMode && (
            <>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
                <input
                  type="checkbox"
                  id="dropboxRecursive"
                  className="rounded"
                />
                Scan subfolders recursively
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="dropboxPostAction"
                    className="text-xs text-blue-700 dark:text-blue-300 block mb-1"
                  >
                    Post-upload action:
                  </label>
                  <select
                    id="dropboxPostAction"
                    className="input-field text-sm py-1"
                    defaultValue="none"
                    onChange={(e) => {
                      const moveFolder =
                        document.getElementById(
                          "dropboxMoveFolder",
                        );
                      if (moveFolder) {
                        moveFolder.classList.toggle(
                          "hidden",
                          e.target.value !== "move",
                        );
                      }
                    }}
                  >
                    <option value="none">None</option>
                    <option value="rename">
                      Rename to video ID
                    </option>
                    <option value="delete">
                      Delete from Dropbox
                    </option>
                    <option value="move">Move to folder</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="dropboxPrivacy"
                    className="text-xs text-blue-700 dark:text-blue-300 block mb-1"
                  >
                    Privacy:
                  </label>
                  <select
                    id="dropboxPrivacy"
                    className="input-field text-sm py-1"
                    defaultValue="public"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>
              <div id="dropboxMoveFolder" className="hidden">
                <label
                  htmlFor="dropboxCompletedFolder"
                  className="text-xs text-blue-700 dark:text-blue-300 block mb-1"
                >
                  Completed folder path (for move action):
                </label>
                <input
                  type="text"
                  id="dropboxCompletedFolder"
                  placeholder="/Completed or /Uploaded"
                  className="input-field text-sm font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200 mt-2">
                <input
                  type="checkbox"
                  checked={skipDuplicateTitles}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setSkipDuplicateTitles(v);
                    if (typeof window !== "undefined") {
                      localStorage.setItem(
                        DASHBOARD_STORAGE.dropboxSkipDuplicateTitles,
                        String(v),
                      );
                    }
                  }}
                  className="rounded"
                />
                Skip videos already on channel (by title)
              </label>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
              💡 Enter Dropbox folder path starting with{" "}
              <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                /
              </code>{" "}
              (e.g.,{" "}
              <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                /Videos
              </code>{" "}
              or{" "}
              <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                /My Videos/Uploads
              </code>
              )
            </p>
            </>
            )}
          </div>
        </div>
      </div>
    </div>

    {!dropboxPythonQueueMode && (
    <>
    <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">🖼️</span>
        <div className="flex-1">
          <strong className="text-violet-900 dark:text-violet-100 block mb-1">
            Thumbnails folder (optional)
          </strong>
          <p className="text-sm text-violet-800 dark:text-violet-200 mb-3">
            Pick a Dropbox folder with thumbnail images (JPG, PNG,
            GIF, WebP). Thumbnails are matched to videos by
            filename without extension (e.g.{" "}
            <code className="bg-violet-100 dark:bg-violet-800 px-1 rounded text-xs">
              intro.mp4
            </code>{" "}
            →{" "}
            <code className="bg-violet-100 dark:bg-violet-800 px-1 rounded text-xs">
              intro.jpg
            </code>
            ).
          </p>
          <div
            className={
              hasDropboxAuth !== true
                ? "opacity-50 pointer-events-none"
                : ""
            }
          >
            <div className="flex gap-2">
              <input
                type="text"
                id="dropboxThumbnailsFolderPath"
                name="dropboxThumbnailsFolderPath"
                placeholder="/Thumbnails or leave empty"
                value={dropboxThumbnailsFolderPath}
                onChange={(e) => {
                  setDropboxThumbnailsFolderPath(e.target.value);
                  if (typeof window !== "undefined") {
                    if (e.target.value) {
                      localStorage.setItem(
                        DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
                        e.target.value,
                      );
                    } else {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
                      );
                    }
                  }
                }}
                className="input-field flex-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setDropboxBrowserMode("folder");
                  setDropboxBrowserContext("thumbnails-folder");
                  setShowDropboxBrowser(true);
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg transition-colors"
                disabled={hasDropboxAuth !== true}
              >
                📂 Browse
              </button>
              {dropboxThumbnailsFolderPath && (
                <button
                  type="button"
                  onClick={() => {
                    setDropboxThumbnailsFolderPath("");
                    const input = document.getElementById(
                      "dropboxThumbnailsFolderPath",
                    ) as HTMLInputElement;
                    if (input) input.value = "";
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(
                        "dropboxThumbnailsFolderPath",
                      );
                    }
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {dropboxThumbnailsFolderPath && (
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                ✓ Thumbnails folder:{" "}
                <strong>{dropboxThumbnailsFolderPath}</strong>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* CSV/XLSX File for Metadata from Dropbox */}
    <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📄</span>
        <div className="flex-1">
          <strong className="text-orange-900 dark:text-orange-100 block mb-1">
            CSV/XLSX File for Metadata (Optional)
          </strong>
          <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
            Optionally provide a CSV or XLSX file from Dropbox
            with video metadata. The file should have columns like
            youtube_title, youtube_description, video_url, etc.
          </p>
          {/* Always render inputs, but disable if not authenticated */}
          <div
            className={
              hasDropboxAuth !== true
                ? "opacity-50 pointer-events-none"
                : ""
            }
          >
            <label
              htmlFor="dropboxMetadataCsvFile"
              className="label text-sm"
            >
              📄 CSV/XLSX File from Dropbox
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="dropboxMetadataCsvFile"
                name="dropboxMetadataCsvFile"
                placeholder="/path/to/file.csv or /path/to/file.xlsx"
                value={selectedDropboxCsvFile}
                onChange={(e) => {
                  setSelectedDropboxCsvFile(e.target.value);
                  if (typeof window !== "undefined") {
                    if (e.target.value) {
                      localStorage.setItem(
                        DASHBOARD_STORAGE.selectedDropboxCsvFile,
                        e.target.value,
                      );
                    } else {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.selectedDropboxCsvFile,
                      );
                    }
                  }
                }}
                className="input-field flex-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setDropboxBrowserMode("file");
                  setDropboxBrowserContext("sheets-file");
                  setShowDropboxBrowser(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                disabled={hasDropboxAuth !== true}
              >
                📂 Browse
              </button>
              {selectedDropboxCsvFile && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDropboxCsvFile("");
                    setDropboxSheetNames([]);
                    setSelectedDropboxSheetName("");
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.selectedDropboxCsvFile,
                      );
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.selectedDropboxSheetName,
                      );
                    }
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {selectedDropboxCsvFile && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                ✓ Selected:{" "}
                <strong>{selectedDropboxCsvFile}</strong>
              </p>
            )}
            {selectedDropboxCsvFile &&
              (dropboxSheetNames.length > 0 ||
                loadingDropboxSheets) && (
                <div className="mt-3">
                  <label
                    htmlFor="dropboxSheetName"
                    className="label text-sm"
                  >
                    📑 Sheet (for XLSX)
                  </label>
                  <select
                    id="dropboxSheetName"
                    name="dropboxSheetName"
                    value={selectedDropboxSheetName}
                    onChange={(e) => {
                      setSelectedDropboxSheetName(e.target.value);
                      if (typeof window !== "undefined") {
                        localStorage.setItem(
                          DASHBOARD_STORAGE.selectedDropboxSheetName,
                          e.target.value,
                        );
                      }
                    }}
                    disabled={loadingDropboxSheets}
                    className="input-field w-full max-w-xs"
                  >
                    {loadingDropboxSheets ? (
                      <option value="">Loading sheets…</option>
                    ) : (
                      dropboxSheetNames.map((s) => (
                        <option key={s.title} value={s.title}>
                          {s.title}
                        </option>
                      ))
                    )}
                  </select>
                  {dropboxSheetNames.length > 1 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Choose which sheet/tab to use for metadata
                    </p>
                  )}
                </div>
              )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Click <strong>Browse</strong> to select a CSV or
              XLSX file from Dropbox, or enter the file path
              manually
            </p>
          </div>
          {hasDropboxAuth !== true && (
            <p className="mt-2 text-xs text-orange-800 dark:text-orange-200">
              {dropboxAuthLoading || hasDropboxAuth === null
                ? "Checking Dropbox…"
                : "Connect Dropbox in the header to enable Browse for this section."}
            </p>
          )}
        </div>
      </div>
    </div>
    </>
    )}

    {/* Dropbox Upload Button */}
    {!dropboxPythonQueueMode ? (
    <button
      type="button"
      onClick={async () => {
        const folderPath = (
          document.getElementById(
            "dropboxFolderPath",
          ) as HTMLInputElement
        )?.value?.trim();
        if (!folderPath) {
          showAppToast({
            message: "Please enter a Dropbox folder path",
            type: "error",
          });
          return;
        }
        if (dropboxUploading) {
          return; // Prevent double-click
        }
        setDropboxUploading(true);
        try {
          const scheduleVpd =
            schedulingEnabled && globalVideosPerDay.trim()
              ? parseInt(globalVideosPerDay.trim(), 10)
              : undefined;
          if (
            schedulingEnabled &&
            scheduleVpd !== undefined &&
            (Number.isNaN(scheduleVpd) || scheduleVpd < 0)
          ) {
            showAppToast({
              message: "Videos per day must be a positive number",
              type: "error",
            });
            setDropboxUploading(false);
            return;
          }

          const response = await fetch("/api/upload-dropbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              dropboxFolderPath: folderPath,
              recursive:
                (
                  document.getElementById(
                    "dropboxRecursive",
                  ) as HTMLInputElement
                )?.checked || false,
              postUploadAction:
                (
                  document.getElementById(
                    "dropboxPostAction",
                  ) as HTMLSelectElement
                )?.value || "none",
              completedFolderPath:
                (
                  document.getElementById(
                    "dropboxCompletedFolder",
                  ) as HTMLInputElement
                )?.value?.trim() || undefined,
              privacyStatus:
                (
                  document.getElementById(
                    "dropboxPrivacy",
                  ) as HTMLSelectElement
                )?.value || "public",
              videosPerDay:
                schedulingEnabled &&
                scheduleVpd !== undefined &&
                !Number.isNaN(scheduleVpd) &&
                scheduleVpd > 0
                  ? scheduleVpd
                  : undefined,
              dropboxCsvPath: selectedDropboxCsvFile || undefined,
              dropboxSheetName:
                selectedDropboxSheetName || undefined,
              dropboxThumbnailsFolderPath:
                dropboxThumbnailsFolderPath || undefined,
              useWorker: true,
              // Use the "Check for duplicates before adding" checkbox (checkDuplicatesBeforeUpload)
              skipDuplicateTitles: checkDuplicatesBeforeUpload,
            }),
          });
          const data = await response.json();
          if (response.ok) {
            showAppToast({
              message: `Upload queued: ${data.totalItems} videos from "${data.folderPath}"`,
              type: "success",
            });
            setDropboxUploadFolderPath("");
            setSelectedDropboxCsvFile("");
            setSelectedDropboxSheetName("");
            setDropboxThumbnailsFolderPath("");
            const dropboxFolderInput = document.getElementById(
              "dropboxFolderPath",
            ) as HTMLInputElement | null;
            if (dropboxFolderInput) {
              dropboxFolderInput.value = "";
            }
            if (typeof window !== "undefined") {
              localStorage.removeItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
              localStorage.removeItem(
                DASHBOARD_STORAGE.selectedDropboxCsvFile,
              );
              localStorage.removeItem(
                DASHBOARD_STORAGE.selectedDropboxSheetName,
              );
              localStorage.removeItem(
                DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
              );
            }
            if (data.jobId && setSelectedJobId) {
              setSelectedJobId(data.jobId);
              if (fetchJobStatus) {
                fetchJobStatus(data.jobId);
              }
              if (fetchQueue) {
                fetchQueue();
              }
            }
          } else {
            showAppToast({
              message:
                data.error || "Failed to queue Dropbox upload",
              type: "error",
            });
          }
        } catch (error: any) {
          showAppToast({
            message: `Error: ${error.message}`,
            type: "error",
          });
        } finally {
          setDropboxUploading(false);
        }
      }}
      disabled={
        !dropboxUploadFolderPath ||
        hasDropboxAuth !== true ||
        dropboxUploading
      }
      className={`btn-primary w-full ${dropboxUploading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {dropboxUploading
        ? "Checking duplicates..."
        : "Upload from Dropbox"}
    </button>
    ) : (
    <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 space-y-3">
      <p className="text-sm text-gray-800 dark:text-gray-200">
        Standard &quot;Upload from Dropbox&quot; is hidden while a
        Python bot Dropbox queue is configured. The worker consumes{" "}
        <code className="text-xs">manifests/*.json</code> from your
        Dropbox folder.
      </p>
      <button
        type="button"
        onClick={() => {
          void clearDropboxPythonQueueMode();
          showAppToast({
            message:
              "Switched to standard Dropbox bulk. Pick a folder again to queue videos.",
            type: "info",
          });
        }}
        className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
      >
        Use standard Dropbox bulk instead
      </button>
    </div>
    )}
  </>
      )}
    </>
  );
}
