"use client";

import { useAppToast } from "@/app/app-toast-context";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "driveUploadFolderId"
  | "setDriveUploadFolderId"
  | "setDriveUploadFolderName"
  | "setDriveBrowserContext"
  | "setShowDriveBrowser"
  | "setShowSheetsBrowser"
  | "debounceTimerRef"
  | "fetchSheets"
  | "availableSheets"
  | "setAvailableSheets"
  | "loadingSheets"
  | "spreadsheetTitle"
  | "setSpreadsheetTitle"
>;

export default function UploadFormsBulkDriveBlock(props: Props) {
  const showAppToast = useAppToast();
  const {
    uploadSource,
    driveUploadFolderId,
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setDriveBrowserContext,
    setShowDriveBrowser,
    setShowSheetsBrowser,
    debounceTimerRef,
    fetchSheets,
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
  } = props;

  return (
    <>
      {!HIDE_GOOGLE_DRIVE_SHEETS && uploadSource === "drive" && (
  <>
    <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📁</span>
        <div className="flex-1">
          <strong className="text-green-900 dark:text-green-100 block mb-1">
            Upload from Google Drive Folder
          </strong>
          <p className="text-sm text-green-800 dark:text-green-200 mb-3">
            Upload all videos from a Google Drive folder. Supports
            recursive folder scanning and post-upload actions.
          </p>
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
                  if (e.target.value) {
                    localStorage.setItem(
                      DASHBOARD_STORAGE.driveUploadFolderId,
                      e.target.value,
                    );
                  } else {
                    localStorage.removeItem(
                      DASHBOARD_STORAGE.driveUploadFolderId,
                    );
                    localStorage.removeItem(
                      DASHBOARD_STORAGE.driveUploadFolderName,
                    );
                  }
                }
              }}
              className="input-field flex-1 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => {
                setDriveBrowserContext("drive");
                setShowDriveBrowser(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              📂 Browse
            </button>
            {driveUploadFolderId && (
              <button
                type="button"
                onClick={() => {
                  setDriveUploadFolderId("");
                  setDriveUploadFolderName("");
                  const input = document.getElementById(
                    "driveFolderId",
                  ) as HTMLInputElement;
                  if (input) input.value = "";
                  if (typeof window !== "undefined") {
                    localStorage.removeItem(
                      DASHBOARD_STORAGE.driveUploadFolderId,
                    );
                    localStorage.removeItem(
                      DASHBOARD_STORAGE.driveUploadFolderName,
                    );
                  }
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                ✕ Clear
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const folderId = (
                  document.getElementById(
                    "driveFolderId",
                  ) as HTMLInputElement
                )?.value?.trim();
                if (!folderId) {
                  showAppToast({
                    message: "Please enter a Drive folder ID",
                    type: "error",
                  });
                  return;
                }
                try {
                  const response = await fetch(
                    "/api/upload-drive",
                    {
                      method: "POST",
                      credentials: "include",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        driveFolderId: folderId,
                        recursive:
                          (
                            document.getElementById(
                              "driveRecursive",
                            ) as HTMLInputElement
                          )?.checked || false,
                        postUploadAction:
                          (
                            document.getElementById(
                              "drivePostAction",
                            ) as HTMLSelectElement
                          )?.value || "none",
                        completedFolderId:
                          (
                            document.getElementById(
                              "driveCompletedFolder",
                            ) as HTMLInputElement
                          )?.value?.trim() || undefined,
                        privacyStatus:
                          (
                            document.getElementById(
                              "drivePrivacy",
                            ) as HTMLSelectElement
                          )?.value || "public",
                        useWorker: true,
                      }),
                    },
                  );
                  const data = await response.json();
                  if (response.ok) {
                    showAppToast({
                      message: `Upload queued: ${data.totalItems} videos from "${data.folderName}"`,
                      type: "success",
                    });
                    setDriveUploadFolderId("");
                    setDriveUploadFolderName("");
                    const driveFolderInput =
                      document.getElementById(
                        "driveFolderId",
                      ) as HTMLInputElement | null;
                    if (driveFolderInput) {
                      driveFolderInput.value = "";
                    }
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.driveUploadFolderId,
                      );
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.driveUploadFolderName,
                      );
                    }
                  } else {
                    showAppToast({
                      message:
                        data.error ||
                        "Failed to queue Drive upload",
                      type: "error",
                    });
                  }
                } catch (error: any) {
                  showAppToast({
                    message: `Error: ${error.message}`,
                    type: "error",
                  });
                }
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Upload Folder
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
              <input
                type="checkbox"
                id="driveRecursive"
                className="rounded"
              />
              Scan subfolders recursively
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="drivePostAction"
                  className="text-xs text-green-700 dark:text-green-300 block mb-1"
                >
                  Post-upload action:
                </label>
                <select
                  id="drivePostAction"
                  className="input-field text-sm py-1"
                  defaultValue="none"
                  onChange={(e) => {
                    const moveFolder =
                      document.getElementById("driveMoveFolder");
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
                    Delete from Drive
                  </option>
                  <option value="move">Move to folder</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="drivePrivacy"
                  className="text-xs text-green-700 dark:text-green-300 block mb-1"
                >
                  Privacy:
                </label>
                <select
                  id="drivePrivacy"
                  className="input-field text-sm py-1"
                  defaultValue="public"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
            <div id="driveMoveFolder" className="hidden">
              <label
                htmlFor="driveCompletedFolder"
                className="text-xs text-green-700 dark:text-green-300 block mb-1"
              >
                Completed folder ID (for move action):
              </label>
              <input
                type="text"
                id="driveCompletedFolder"
                placeholder="Enter folder ID"
                className="input-field text-sm font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-green-700 dark:text-green-300 mt-2">
            💡 Click <strong>Browse</strong> to select a folder
            visually, or enter folder ID manually from Drive URL:{" "}
            <code className="bg-green-100 dark:bg-green-800 px-1 rounded">
              drive.google.com/drive/folders/FOLDER_ID
            </code>
          </p>
        </div>
      </div>
    </div>

    {/* Google Sheets for Metadata (Drive) */}
    <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📊</span>
        <div className="flex-1">
          <strong className="text-indigo-900 dark:text-indigo-100 block mb-1">
            Google Sheets for Metadata (Optional)
          </strong>
          <p className="text-sm text-indigo-800 dark:text-indigo-200 mb-3">
            Optionally provide a Google Sheet with video metadata.
            The sheet should have columns like youtube_title,
            youtube_description, video_url, drive_file_id, etc.
          </p>
          <div>
            <label
              htmlFor="driveSpreadsheetUrl"
              className="label text-sm"
            >
              📊 Google Sheets URL or ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="driveSpreadsheetUrl"
                name="driveSpreadsheetUrl"
                placeholder="https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit"
                className="input-field font-mono text-sm flex-1"
                onChange={(e) => {
                  const url = e.target.value.trim();
                  if (typeof window !== "undefined") {
                    if (url) {
                      localStorage.setItem(
                        DASHBOARD_STORAGE.sheetsSpreadsheetUrl,
                        url,
                      );
                    } else {
                      localStorage.removeItem(
                        DASHBOARD_STORAGE.sheetsSpreadsheetUrl,
                      );
                    }
                  }
                  if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                  }
                  if (url) {
                    debounceTimerRef.current = setTimeout(() => {
                      fetchSheets(url);
                    }, 800);
                  } else {
                    setAvailableSheets([]);
                    setSpreadsheetTitle("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowSheetsBrowser(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                <span>📂</span>
                <span>Browse</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById(
                    "driveSpreadsheetUrl",
                  ) as HTMLInputElement;
                  if (input?.value.trim()) {
                    fetchSheets(input.value.trim());
                  }
                }}
                disabled={loadingSheets}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingSheets ? "⏳" : "🔍"}
              </button>
            </div>
            {spreadsheetTitle && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ Found: <strong>{spreadsheetTitle}</strong>
              </p>
            )}
            {availableSheets.length > 0 && (
              <div className="mt-2">
                <label
                  htmlFor="driveSheetName"
                  className="text-xs block mb-1"
                >
                  Select Sheet:
                </label>
                <select
                  id="driveSheetName"
                  name="driveSheetName"
                  className="input-field text-sm"
                >
                  <option value="">Select a sheet...</option>
                  {availableSheets.map((sheet) => (
                    <option
                      key={sheet.sheetId}
                      value={sheet.title}
                    >
                      {sheet.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* CSV File for Metadata (Drive) */}
    <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📄</span>
        <div className="flex-1">
          <strong className="text-orange-900 dark:text-orange-100 block mb-1">
            CSV File for Metadata (Optional)
          </strong>
          <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
            Optionally provide a CSV file with video metadata. The
            CSV should have columns like youtube_title,
            youtube_description, video_url, drive_file_id, etc.
          </p>
          <div>
            <label
              htmlFor="driveCsvFile"
              className="label text-sm"
            >
              📄 CSV File
            </label>
            <input
              type="file"
              id="driveCsvFile"
              name="driveCsvFile"
              accept=".csv,.xlsx,.xls"
              className="input-field"
            />
          </div>
        </div>
      </div>
    </div>
  </>
      )}
    </>
  );
}
