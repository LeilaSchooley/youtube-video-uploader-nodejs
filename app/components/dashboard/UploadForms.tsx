"use client";

import { FormEvent, RefObject, useState, useRef, useEffect } from "react";
import DriveBrowser from "./DriveBrowser";
import SheetsBrowser from "./SheetsBrowser";
import SheetPreview from "./SheetPreview";

interface UploadFormsProps {
  // Single Upload
  showSingleUpload: boolean;
  toggleSingleUpload: () => void;
  handleSingleUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;


  // Batch/CSV Upload
  showBatchUpload: boolean;
  toggleBatchUpload: () => void;
  showBatchInstructions: boolean;
  toggleBatchInstructions: () => void;
  handleCsvUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedCsvFile: File | null;
  setSelectedCsvFile: (file: File | null) => void;
  csvFileInputRef: RefObject<HTMLInputElement | null>;
  csvUploading: boolean;
  validateCsv: (file: File) => Promise<string[]>;
  csvValidationErrors: string[];
  setCsvValidationErrors: (errors: string[]) => void;
  uploadProgress: {
    currentFile: number;
    totalFiles: number;
    currentFileName: string;
    message: string;
    status: string;
    copyStats?: {
      videosCopied: number;
      videosSkipped: number;
      thumbnailsCopied: number;
      thumbnailsSkipped: number;
      errors: string[];
    };
  } | null;

  // Bulk Upload
  showBulkUpload: boolean;
  setShowBulkUpload: (show: boolean) => void;
  handleBulkUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedBulkFiles: File[];
  setSelectedBulkFiles: (files: File[]) => void;
  bulkFilesInputRef: RefObject<HTMLInputElement | null>;
  bulkUploading: boolean;
  bulkUploadProgress: {
    total: number;
    totalBatches: number;
    currentBatch: number;
    completed: number;
    failed: number;
    currentFile?: string;
    message?: string;
  } | null;
  bulkUrls: string[];
  setBulkUrls: (urls: string[]) => void;
  urlAuthHeaders: string;
  setUrlAuthHeaders: (headers: string) => void;
  urlTimeout: string;
  setUrlTimeout: (timeout: string) => void;


  // Toast
  setShowToast: (toast: { message: string; type: "success" | "error" | "info" }) => void;
  
  // Queue management callbacks
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;
}

export default function UploadForms({
  showSingleUpload,
  toggleSingleUpload,
  handleSingleUpload,
  selectedVideoFile,
  setSelectedVideoFile,
  fileInputRef,
  uploading,
  showBatchUpload,
  toggleBatchUpload,
  showBatchInstructions,
  toggleBatchInstructions,
  handleCsvUpload,
  selectedCsvFile,
  setSelectedCsvFile,
  csvFileInputRef,
  csvUploading,
  validateCsv,
  csvValidationErrors,
  setCsvValidationErrors,
  uploadProgress,
  showBulkUpload,
  setShowBulkUpload,
  handleBulkUpload,
  selectedBulkFiles,
  setSelectedBulkFiles,
  bulkFilesInputRef,
  bulkUploading,
  bulkUploadProgress,
  bulkUrls,
  setBulkUrls,
  urlAuthHeaders,
  setUrlAuthHeaders,
  urlTimeout,
  setUrlTimeout,
  setShowToast,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
}: UploadFormsProps) {
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [showSheetsBrowser, setShowSheetsBrowser] = useState(false);
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<Array<{ title: string; sheetId: number }>>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>("");
  const [selectedDriveFolderId, setSelectedDriveFolderId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sheetsDriveFolderId") || "";
    }
    return "";
  });
  const [selectedDriveFolderName, setSelectedDriveFolderName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sheetsDriveFolderName") || "";
    }
    return "";
  });
  const [driveUploadFolderId, setDriveUploadFolderId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("driveUploadFolderId") || "";
    }
    return "";
  });
  const [driveUploadFolderName, setDriveUploadFolderName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("driveUploadFolderName") || "";
    }
    return "";
  });
  const [driveBrowserContext, setDriveBrowserContext] = useState<"drive" | "sheets">("drive");
  const [videosPerDay, setVideosPerDay] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("videosPerDay") || "";
    }
    return "";
  });

  const handleDriveFolderSelect = (folderId: string, folderName: string) => {
    const input = document.getElementById('driveFolderId') as HTMLInputElement;
    if (input) {
      input.value = folderId;
    }
    setDriveUploadFolderId(folderId);
    setDriveUploadFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem("driveUploadFolderId", folderId);
      localStorage.setItem("driveUploadFolderName", folderName);
    }
    setShowToast({ message: `Selected folder: ${folderName}`, type: "success" });
  };

  const handleSheetsDriveFolderSelect = (folderId: string, folderName: string) => {
    setSelectedDriveFolderId(folderId);
    setSelectedDriveFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem("sheetsDriveFolderId", folderId);
      localStorage.setItem("sheetsDriveFolderName", folderName);
    }
    setShowToast({ message: `Selected Drive folder for matching: ${folderName}`, type: "success" });
  };

  // Load saved values from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSpreadsheetUrl = localStorage.getItem("sheetsSpreadsheetUrl");
      const savedSheetsDriveFolderId = localStorage.getItem("sheetsDriveFolderId");
      const savedSheetsDriveFolderName = localStorage.getItem("sheetsDriveFolderName");
      const savedDriveUploadFolderId = localStorage.getItem("driveUploadFolderId");
      const savedDriveUploadFolderName = localStorage.getItem("driveUploadFolderName");
      
      if (savedSpreadsheetUrl) {
        const input = document.getElementById('spreadsheetUrl') as HTMLInputElement;
        if (input && !input.value) {
          input.value = savedSpreadsheetUrl;
          // Trigger fetch to load sheets
          fetchSheets(savedSpreadsheetUrl);
        }
      }
      
      if (savedSheetsDriveFolderId && savedSheetsDriveFolderName) {
        setSelectedDriveFolderId(savedSheetsDriveFolderId);
        setSelectedDriveFolderName(savedSheetsDriveFolderName);
      }
      
      if (savedDriveUploadFolderId && savedDriveUploadFolderName) {
        setDriveUploadFolderId(savedDriveUploadFolderId);
        setDriveUploadFolderName(savedDriveUploadFolderName);
        const input = document.getElementById('driveFolderId') as HTMLInputElement;
        if (input && !input.value) {
          input.value = savedDriveUploadFolderId;
        }
      }
      
      const savedVideosPerDay = localStorage.getItem("videosPerDay");
      if (savedVideosPerDay) {
        setVideosPerDay(savedVideosPerDay);
        const videosPerDayInput = document.getElementById('videosPerDay') as HTMLInputElement;
        if (videosPerDayInput && !videosPerDayInput.value) {
          videosPerDayInput.value = savedVideosPerDay;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSheetSelect = async (spreadsheetId: string, spreadsheetName: string) => {
    const input = document.getElementById('spreadsheetUrl') as HTMLInputElement;
    if (input) {
      // Set the spreadsheet ID in the input
      input.value = spreadsheetId;
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("sheetsSpreadsheetUrl", spreadsheetId);
      }
      // Trigger the fetch to load sheets
      await fetchSheets(spreadsheetId);
    }
    setShowToast({ message: `Selected sheet: ${spreadsheetName}`, type: "success" });
  };

  const handlePreviewSheet = async () => {
    const spreadsheetUrlInput = document.getElementById('spreadsheetUrl') as HTMLInputElement;
    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const rangeInput = document.getElementById('range') as HTMLInputElement;

    const spreadsheetUrl = spreadsheetUrlInput?.value.trim();
    const sheetName = sheetNameSelect?.value.trim();
    const range = rangeInput?.value.trim() || undefined;

    if (!spreadsheetUrl) {
      setShowToast({ message: "Please enter or select a Google Sheets URL/ID first", type: "error" });
      return;
    }

    if (!sheetName) {
      setShowToast({ message: "Please select a sheet first", type: "error" });
      return;
    }

    setLoadingPreview(true);
    try {
      const response = await fetch("/api/preview-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetUrl,
          sheetName,
          range,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setPreviewData(data);
        setShowSheetPreview(true);
      } else {
        setShowToast({
          message: data.error || "Failed to preview sheet",
          type: "error",
        });
      }
    } catch (error: any) {
      setShowToast({
        message: `Error: ${error.message}`,
        type: "error",
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const fetchSheets = async (spreadsheetUrl: string) => {
    if (!spreadsheetUrl.trim()) {
      setAvailableSheets([]);
      setSpreadsheetTitle("");
      return;
    }

    setLoadingSheets(true);
    try {
      const response = await fetch(`/api/sheets-info?spreadsheetUrl=${encodeURIComponent(spreadsheetUrl)}`);
      const data = await response.json();
      
      if (response.ok && data.success) {
        setAvailableSheets(data.sheets || []);
        setSpreadsheetTitle(data.title || "");
        
        // Auto-select first sheet if available
        if (data.sheets && data.sheets.length > 0) {
          const sheetSelect = document.getElementById('sheetName') as HTMLSelectElement;
          if (sheetSelect) {
            sheetSelect.value = data.sheets[0].title;
          }
        }
      } else {
        setAvailableSheets([]);
        setSpreadsheetTitle("");
        if (data.error) {
          setShowToast({ message: data.error, type: "error" });
        }
      }
    } catch (error: any) {
      console.error("Error fetching sheets:", error);
      setAvailableSheets([]);
      setSpreadsheetTitle("");
    } finally {
      setLoadingSheets(false);
    }
  };

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  return (
    <>
      {showDriveBrowser && (
        <DriveBrowser
          onSelectFolder={(folderId, folderName) => {
            if (driveBrowserContext === "sheets") {
              handleSheetsDriveFolderSelect(folderId, folderName);
            } else {
              handleDriveFolderSelect(folderId, folderName);
            }
            setShowDriveBrowser(false);
          }}
          onClose={() => setShowDriveBrowser(false)}
        />
      )}

      {showSheetsBrowser && (
        <SheetsBrowser
          onSelectSheet={handleSheetSelect}
          onClose={() => setShowSheetsBrowser(false)}
        />
      )}

      {showSheetPreview && previewData && (
        <SheetPreview
          previewData={previewData}
          onClose={() => {
            setShowSheetPreview(false);
            setPreviewData(null);
          }}
        />
      )}
      {/* Single Video Upload */}
      <div className="card animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-3xl">🎬</span>
            <span>Single Video Upload</span>
          </h2>
          <button
            type="button"
            onClick={toggleSingleUpload}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            {showSingleUpload ? "Hide" : "Show"}
          </button>
        </div>
        {showSingleUpload && (
          <form onSubmit={handleSingleUpload} className="flex flex-col gap-5">
            <label htmlFor="title" className="label">
              Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              placeholder="Enter video title"
              required
              className="input-field"
            />

            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              placeholder="Enter video description"
              required
              className="input-field min-h-[100px] resize-y"
            />

            <label htmlFor="video" className="label">
              Choose File
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                selectedVideoFile
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-300 hover:border-red-500"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("video/")) {
                  setSelectedVideoFile(file);
                  if (fileInputRef.current) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInputRef.current.files = dataTransfer.files;
                  }
                }
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileInputRef}
                type="file"
                id="video"
                name="video"
                accept="video/*"
                required
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedVideoFile(file);
                  }
                }}
              />
              {selectedVideoFile ? (
                <div>
                  <div className="text-4xl mb-2">✅</div>
                  <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                    {selectedVideoFile.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {(selectedVideoFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Click to change file
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-2">📹</div>
                  <p className="text-gray-600 dark:text-gray-400 mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Video files only
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="publishDate" className="label">
                  Schedule Publish Date
                </label>
                <input
                  type="datetime-local"
                  id="publishDate"
                  name="publishDate"
                  className="input-field"
                />
              </div>
            </div>

            <label htmlFor="privacyStatus" className="label">
              Privacy Status
            </label>
            <select
              id="privacyStatus"
              name="privacyStatus"
              defaultValue="public"
              required
              className="input-field mb-5"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
            </select>

            <button
              type="submit"
              disabled={uploading}
              className={`btn-primary ${
                uploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {uploading ? "Uploading..." : "Upload Video"}
            </button>
          </form>
        )}
      </div>



      {/* Bulk Upload Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Bulk Upload (Step 1)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowBulkUpload(!showBulkUpload)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
          >
            {showBulkUpload ? "Hide" : "Show"}
          </button>
        </div>

        {showBulkUpload && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>📦 Bulk Upload:</strong> Upload multiple videos from files or URLs. Videos stream directly to YouTube - no disk storage needed! Uploads are processed in the background.
              </p>
            </div>

            <form onSubmit={handleBulkUpload} className="flex flex-col gap-5">
              {/* Google Drive Folder Upload */}
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xl">📁</span>
                  <div className="flex-1">
                    <strong className="text-green-900 dark:text-green-100 block mb-1">
                      Upload from Google Drive Folder
                    </strong>
                    <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                      Upload all videos from a Google Drive folder. Supports recursive folder scanning and post-upload actions.
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
                              localStorage.setItem("driveUploadFolderId", e.target.value);
                            } else {
                              localStorage.removeItem("driveUploadFolderId");
                              localStorage.removeItem("driveUploadFolderName");
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
                            const input = document.getElementById('driveFolderId') as HTMLInputElement;
                            if (input) input.value = "";
                            if (typeof window !== "undefined") {
                              localStorage.removeItem("driveUploadFolderId");
                              localStorage.removeItem("driveUploadFolderName");
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
                          const folderId = (document.getElementById('driveFolderId') as HTMLInputElement)?.value?.trim();
                          if (!folderId) {
                            setShowToast({ message: "Please enter a Drive folder ID", type: "error" });
                            return;
                          }
                          try {
                            const response = await fetch('/api/upload-drive', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                driveFolderId: folderId,
                                recursive: (document.getElementById('driveRecursive') as HTMLInputElement)?.checked || false,
                                postUploadAction: (document.getElementById('drivePostAction') as HTMLSelectElement)?.value || 'none',
                                completedFolderId: (document.getElementById('driveCompletedFolder') as HTMLInputElement)?.value?.trim() || undefined,
                                privacyStatus: (document.getElementById('drivePrivacy') as HTMLSelectElement)?.value || 'public',
                                useWorker: true,
                              }),
                            });
                            const data = await response.json();
                            if (response.ok) {
                              setShowToast({ message: `Upload queued: ${data.totalItems} videos from "${data.folderName}"`, type: "success" });
                              setDriveUploadFolderId("");
                              setDriveUploadFolderName("");
                              (document.getElementById('driveFolderId') as HTMLInputElement).value = '';
                              if (typeof window !== "undefined") {
                                localStorage.removeItem("driveUploadFolderId");
                                localStorage.removeItem("driveUploadFolderName");
                              }
                            } else {
                              setShowToast({ message: data.error || "Failed to queue Drive upload", type: "error" });
                            }
                          } catch (error: any) {
                            setShowToast({ message: `Error: ${error.message}`, type: "error" });
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
                          <label htmlFor="drivePostAction" className="text-xs text-green-700 dark:text-green-300 block mb-1">
                            Post-upload action:
                          </label>
                          <select
                            id="drivePostAction"
                            className="input-field text-sm py-1"
                            defaultValue="none"
                            onChange={(e) => {
                              const moveFolder = document.getElementById('driveMoveFolder');
                              if (moveFolder) {
                                moveFolder.classList.toggle('hidden', e.target.value !== 'move');
                              }
                            }}
                          >
                            <option value="none">None</option>
                            <option value="rename">Rename to video ID</option>
                            <option value="delete">Delete from Drive</option>
                            <option value="move">Move to folder</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="drivePrivacy" className="text-xs text-green-700 dark:text-green-300 block mb-1">
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
                        <label htmlFor="driveCompletedFolder" className="text-xs text-green-700 dark:text-green-300 block mb-1">
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
                      💡 Click <strong>Browse</strong> to select a folder visually, or enter folder ID manually from Drive URL: <code className="bg-green-100 dark:bg-green-800 px-1 rounded">drive.google.com/drive/folders/FOLDER_ID</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Display */}
              {bulkUploadProgress && bulkUploading && (
                <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                      <div className="animate-spin text-xl">📤</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                        Bulk Uploading Videos
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        {bulkUploadProgress.message || "Preparing..."}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar - Always show when uploading */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-blue-800 dark:text-blue-200 font-medium">
                        {bulkUploadProgress.currentBatch &&
                        bulkUploadProgress.totalBatches ? (
                          <span>
                            Batch {bulkUploadProgress.currentBatch} /{" "}
                            {bulkUploadProgress.totalBatches} •{" "}
                          </span>
                        ) : null}
                        {bulkUploadProgress.completed || 0} succeeded,{" "}
                        {bulkUploadProgress.failed || 0} failed
                        {bulkUploadProgress.total ? " of " + bulkUploadProgress.total : ""}
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">
                        {bulkUploadProgress.total > 0
                          ? Math.round(
                              ((bulkUploadProgress.completed + bulkUploadProgress.failed) /
                                bulkUploadProgress.total) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-4 dark:bg-blue-800 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-4 rounded-full transition-all duration-500 relative"
                        style={{
                          width:
                            bulkUploadProgress.total > 0
                              ? `${Math.min(
                                  100,
                                  Math.round(
                                    ((bulkUploadProgress.completed +
                                      bulkUploadProgress.failed) /
                                      bulkUploadProgress.total) *
                                      100
                                  )
                                )}%`
                              : "0%",
                        }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {bulkUploadProgress.currentFile && (
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500">📁</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {bulkUploadProgress.currentFile}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={bulkUploading || (selectedBulkFiles.length === 0 && bulkUrls.length === 0)}
                className={`btn-primary ${
                  bulkUploading || (selectedBulkFiles.length === 0 && bulkUrls.length === 0)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {bulkUploading ? (
                  <span className="flex items-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Queuing...
                  </span>
                ) : (selectedBulkFiles.length === 0 && bulkUrls.length === 0) ? (
                  "Please select files or enter URLs"
                ) : (
                  `Queue ${selectedBulkFiles.length + bulkUrls.length} Video(s) for Upload`
                )}
              </button>
            </form>
          </div>
        )}
      </div>


      {/* Google Sheets Upload */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Upload from Google Sheets
            </h2>
          </div>
        </div>

          <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>📊 Google Sheets Integration:</strong> Upload videos directly from a Google Sheet containing all metadata. 
              The sheet should have columns like youtube_title, youtube_description, video_url, drive_file_id, etc.
              </p>
            </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const formData = new FormData(form);
              const spreadsheetUrl = (formData.get("spreadsheetUrl") as string)?.trim();
              const sheetName = (formData.get("sheetName") as string)?.trim();
              const range = (formData.get("range") as string)?.trim() || undefined;
              // Use state value if available, otherwise fall back to form data
              const videosPerDayStr = videosPerDay || (formData.get("videosPerDay") as string)?.trim();

              if (!spreadsheetUrl) {
                setShowToast({ message: "Please enter a Google Sheets URL or ID", type: "error" });
                return;
              }

              if (!sheetName) {
                setShowToast({ message: "Please select a sheet", type: "error" });
                return;
              }

              // Validate videosPerDay if provided
              const videosPerDayNum = videosPerDayStr ? parseInt(videosPerDayStr, 10) : undefined;
              if (videosPerDayNum !== undefined && (isNaN(videosPerDayNum) || videosPerDayNum < 0)) {
                setShowToast({ message: "Videos per day must be a positive number", type: "error" });
                return;
              }

              try {
                setShowToast({ message: "Processing Google Sheet...", type: "info" });
                const response = await fetch("/api/upload-sheets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    spreadsheetUrl,
                    sheetName,
                    range,
                    driveFolderId: selectedDriveFolderId || undefined,
                    videosPerDay: videosPerDayNum && videosPerDayNum > 0 ? videosPerDayNum : undefined,
                    // startDate is no longer required - will use today if videosPerDay is set
                  }),
                });

                const data = await response.json();
                if (response.ok) {
                  setShowToast({
                    message: `✅ Upload queued: ${data.totalItems} videos from "${data.spreadsheetTitle}"`,
                    type: "success",
                  });
                  
                  // Automatically select the job and show progress
                  if (data.jobId && setSelectedJobId) {
                    setSelectedJobId(data.jobId);
                    // Fetch job status to show progress
                    if (fetchJobStatus) {
                      fetchJobStatus(data.jobId);
                    }
                    // Refresh queue
                    if (fetchQueue) {
                      fetchQueue();
                    }
                    // Auto-refresh job status every 2 seconds while processing
                    const statusInterval = setInterval(async () => {
                      if (fetchJobStatus) {
                        await fetchJobStatus(data.jobId);
                      }
                      // Check if job is still processing
                      try {
                        const statusRes = await fetch(`/api/bulk-status?jobId=${data.jobId}`);
                        const statusData = await statusRes.json();
                        if (statusData.status === "completed" || statusData.status === "failed" || statusData.status === "cancelled") {
                          clearInterval(statusInterval);
                        }
                      } catch (e) {
                        // Ignore errors
                      }
                    }, 2000);
                    
                    // Clear interval after 10 minutes (safety)
                    setTimeout(() => clearInterval(statusInterval), 10 * 60 * 1000);
                  }
                  
                  form.reset();
                  setAvailableSheets([]);
                  setSpreadsheetTitle("");
                } else {
                  setShowToast({
                    message: data.error || "Failed to process Google Sheet",
                    type: "error",
                  });
                }
              } catch (error: any) {
                setShowToast({
                  message: `Error: ${error.message}`,
                  type: "error",
                });
              }
            }}
            className="flex flex-col gap-5"
          >
            <div>
              <label htmlFor="spreadsheetUrl" className="label">
                📊 Google Sheets URL or ID *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="spreadsheetUrl"
                  name="spreadsheetUrl"
                  placeholder="https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit"
                  className="input-field font-mono text-sm flex-1"
                  required
                  onChange={(e) => {
                    // Debounce the fetch
                    const url = e.target.value.trim();
                    
                    // Save to localStorage
                    if (typeof window !== "undefined") {
                      if (url) {
                        localStorage.setItem("sheetsSpreadsheetUrl", url);
                      } else {
                        localStorage.removeItem("sheetsSpreadsheetUrl");
                      }
                    }
                    
                    // Clear previous timer
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
                    const input = document.getElementById('spreadsheetUrl') as HTMLInputElement;
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Click <strong>Browse</strong> to select from Drive, or paste the URL/ID and click 🔍
                    </p>
                  </div>

            {/* Drive Folder Selection for Video Matching */}
            <div>
              <label htmlFor="sheetsDriveFolderId" className="label">
                📁 Drive Folder (Optional - for matching video_name)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="sheetsDriveFolderId"
                  name="sheetsDriveFolderId"
                  placeholder="Select Drive folder containing videos"
                  value={selectedDriveFolderId}
                  readOnly
                  className="input-field flex-1 font-mono text-sm bg-gray-50 dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDriveBrowserContext("sheets");
                    setShowDriveBrowser(true);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  <span>📂</span>
                  <span>Browse</span>
                </button>
                {selectedDriveFolderId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDriveFolderId("");
                      setSelectedDriveFolderName("");
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("sheetsDriveFolderId");
                        localStorage.removeItem("sheetsDriveFolderName");
                      }
                    }}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
              {selectedDriveFolderName && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ Selected: <strong>{selectedDriveFolderName}</strong>
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select a Drive folder to automatically match <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">video_name</code> column to files in this folder
              </p>
              </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="sheetName" className="label">
                  Select Sheet *
                </label>
                {availableSheets.length > 0 ? (
                  <select
                    id="sheetName"
                    name="sheetName"
                    className="input-field text-sm"
                    required
                    defaultValue={availableSheets[0]?.title || ""}
                  >
                    {availableSheets.map((sheet) => (
                      <option key={sheet.sheetId} value={sheet.title}>
                        {sheet.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    id="sheetName"
                    name="sheetName"
                    className="input-field text-sm"
                    disabled
                  >
                    <option value="">Enter spreadsheet URL first</option>
                  </select>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {availableSheets.length > 0 
                    ? `${availableSheets.length} sheet(s) available`
                    : "Load spreadsheet to see available sheets"}
                </p>
                    </div>

              <div>
                <label htmlFor="range" className="label">
                  Range (Optional)
                </label>
                <input
                  type="text"
                  id="range"
                  name="range"
                  placeholder="A1:Z1000"
                  className="input-field text-sm font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty to read entire sheet
                </p>
                      </div>
                    </div>

            {/* Upload Scheduling */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 text-sm flex items-center gap-2">
                <span>📅</span>
                <span>Upload Scheduling (Optional)</span>
              </h3>
              <div>
                <label htmlFor="videosPerDay" className="label text-sm">
                  Videos Per Day
                </label>
                <input
                  type="number"
                  id="videosPerDay"
                  name="videosPerDay"
                  min="0"
                  placeholder="0 = upload all immediately"
                  value={videosPerDay}
                  onChange={(e) => {
                    setVideosPerDay(e.target.value);
                    if (typeof window !== "undefined") {
                      if (e.target.value) {
                        localStorage.setItem("videosPerDay", e.target.value);
                      } else {
                        localStorage.removeItem("videosPerDay");
                      }
                    }
                  }}
                  className="input-field text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave 0 or empty to upload all immediately. If set, videos will upload X per day starting today.
                </p>
                          </div>
              <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/30 rounded text-xs text-blue-800 dark:text-blue-200">
                <strong>💡 How it works:</strong> If you set "5 videos per day", 
                the first 5 videos will upload today, videos 6-10 tomorrow, and so on. 
                Videos are uploaded immediately but scheduled to publish on their assigned dates.
                <br />
                <strong>Note:</strong> If a video has a <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">scheduleTime</code> or <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">publishAt</code> date in your sheet, that date will be used instead.
                        </div>
                      </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-2 text-sm">
                📋 Required Columns:
              </h3>
              <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">youtube_title</code></li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">youtube_description</code></li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">video_url</code> or <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">drive_file_id</code> or <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">path</code></li>
              </ul>
              <h3 className="font-semibold text-gray-800 dark:text-white mb-2 mt-3 text-sm">
                📋 Optional Columns:
              </h3>
              <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">thumbnail_url</code>, <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">drive_thumbnail_id</code></li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">privacyStatus</code> (default: public)</li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">scheduleTime</code></li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">url_auth_headers</code>, <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">url_timeout</code></li>
                <li><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">post_upload_action</code>, <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">completed_folder_id</code></li>
              </ul>
                          </div>

            <div className="flex gap-3">
                        <button
                          type="button"
                onClick={handlePreviewSheet}
                disabled={loadingPreview || !spreadsheetTitle}
                className={`px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
              >
                {loadingPreview ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Loading...
                  </>
                ) : (
                  <>
                    <span>👁️</span>
                    <span>Preview Sheet</span>
                  </>
                )}
              </button>
              <button
                type="submit"
                className="btn-primary flex-1"
              >
                Upload from Google Sheets
              </button>
            </div>
            </form>
          </div>
      </div>
    </>
  );
}

