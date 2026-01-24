"use client";

import { FormEvent, RefObject, useState, useRef, useEffect } from "react";
import DriveBrowser from "./DriveBrowser";
import DropboxBrowser from "./DropboxBrowser";
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
  const [isHydrated, setIsHydrated] = useState(false);
  const isInitialLoadRef = useRef(true); // Track if we're still loading initial values
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [showDropboxBrowser, setShowDropboxBrowser] = useState(false);
  const [dropboxBrowserMode, setDropboxBrowserMode] = useState<"folder" | "file">("folder");
  const [dropboxBrowserContext, setDropboxBrowserContext] = useState<"bulk" | "sheets-folder" | "sheets-file">("bulk");
  const [showSheetsBrowser, setShowSheetsBrowser] = useState(false);
  const [selectedDropboxFile, setSelectedDropboxFile] = useState<string>(""); // For spreadsheet file from Dropbox
  const [csvSource, setCsvSource] = useState<"local" | "dropbox">("local");
  const [selectedDropboxCsvFile, setSelectedDropboxCsvFile] = useState<string>("");
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<Array<{ title: string; sheetId: number }>>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>("");
  const [selectedDriveFolderId, setSelectedDriveFolderId] = useState<string>("");
  const [selectedDriveFolderName, setSelectedDriveFolderName] = useState<string>("");
  const [selectedDropboxFolderPath, setSelectedDropboxFolderPath] = useState<string>("");
  // Dropbox auth state - starts as null (unknown) until we check
  const [hasDropboxAuth, setHasDropboxAuth] = useState<boolean | null>(null);
  const [dropboxAuthLoading, setDropboxAuthLoading] = useState<boolean>(true);
  // Unified upload source - Drive or Dropbox
  const [uploadSource, setUploadSource] = useState<"drive" | "dropbox">("drive");
  const [dropboxUploadFolderPath, setDropboxUploadFolderPath] = useState<string>("");
  const [driveUploadFolderId, setDriveUploadFolderId] = useState<string>("");
  const [driveUploadFolderName, setDriveUploadFolderName] = useState<string>("");
  const [driveBrowserContext, setDriveBrowserContext] = useState<"drive" | "sheets">("drive");
  const [videosPerDay, setVideosPerDay] = useState<string>("");

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
      
      const savedDropboxFolderPath = localStorage.getItem("sheetsDropboxFolderPath");
      if (savedDropboxFolderPath) {
        setSelectedDropboxFolderPath(savedDropboxFolderPath);
      }

      const savedDropboxUploadFolderPath = localStorage.getItem("dropboxUploadFolderPath");
      if (savedDropboxUploadFolderPath) {
        setDropboxUploadFolderPath(savedDropboxUploadFolderPath);
      }

      const savedCsvSource = localStorage.getItem("csvSource");
      if (savedCsvSource === "local" || savedCsvSource === "dropbox") {
        setCsvSource(savedCsvSource);
      }

      const savedDropboxCsvFile = localStorage.getItem("selectedDropboxCsvFile");
      if (savedDropboxCsvFile) {
        setSelectedDropboxCsvFile(savedDropboxCsvFile);
      }

      // Load unified upload source
      const savedFolderSource = localStorage.getItem("folderSource");
      const savedSheetsSource = localStorage.getItem("sheetsUploadSource");
      if (savedFolderSource === "drive" || savedFolderSource === "dropbox") {
        setUploadSource(savedFolderSource);
      } else if (savedSheetsSource === "sheets") {
        // Legacy: convert "sheets" to "drive"
        setUploadSource("drive");
        localStorage.setItem("folderSource", "drive");
      } else if (savedSheetsSource === "csv") {
        // Legacy: convert "csv" to "drive" (CSV is now optional metadata)
        setUploadSource("drive");
        localStorage.setItem("folderSource", "drive");
      }

      const savedVideosPerDay = localStorage.getItem("videosPerDay");
      if (savedVideosPerDay) {
        setVideosPerDay(savedVideosPerDay);
        const videosPerDayInput = document.getElementById('videosPerDay') as HTMLInputElement;
        if (videosPerDayInput && !videosPerDayInput.value) {
          videosPerDayInput.value = savedVideosPerDay;
        }
      }
      
      // Mark as hydrated after loading all localStorage values
      setIsHydrated(true);
      // Allow auto-save to run after initial load completes
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100); // Small delay to ensure all state updates are applied
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check Dropbox authentication status
  useEffect(() => {
    // First, load cached auth state from localStorage immediately
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("hasDropboxAuth");
      if (cached !== null) {
        setHasDropboxAuth(cached === "true");
      }
    }
    
    // Then verify with API (updates cache if different)
    const checkDropboxAuth = async () => {
      try {
        const response = await fetch('/api/user');
        const data = await response.json();
        const hasAuth = response.ok && data.hasDropbox;
        setHasDropboxAuth(hasAuth);
        // Cache auth state to prevent flash on next mount
        if (typeof window !== "undefined") {
          localStorage.setItem("hasDropboxAuth", hasAuth ? "true" : "false");
        }
      } catch (error) {
        setHasDropboxAuth(false);
        if (typeof window !== "undefined") {
          localStorage.setItem("hasDropboxAuth", "false");
        }
      } finally {
        setDropboxAuthLoading(false);
      }
    };
    checkDropboxAuth();
  }, []);

  // Auto-save to localStorage on state changes (after hydration)
  // Skip during initial load to prevent clearing values that were just loaded
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (dropboxUploadFolderPath) {
      localStorage.setItem("dropboxUploadFolderPath", dropboxUploadFolderPath);
    } else {
      localStorage.removeItem("dropboxUploadFolderPath");
    }
  }, [dropboxUploadFolderPath, isHydrated]); // Include isHydrated but check isInitialLoadRef

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (selectedDropboxCsvFile) {
      localStorage.setItem("selectedDropboxCsvFile", selectedDropboxCsvFile);
    } else {
      localStorage.removeItem("selectedDropboxCsvFile");
    }
  }, [selectedDropboxCsvFile, isHydrated]); // Include isHydrated but check isInitialLoadRef

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (driveUploadFolderId) {
      localStorage.setItem("driveUploadFolderId", driveUploadFolderId);
    } else {
      localStorage.removeItem("driveUploadFolderId");
    }
  }, [driveUploadFolderId, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (driveUploadFolderName) {
      localStorage.setItem("driveUploadFolderName", driveUploadFolderName);
    } else {
      localStorage.removeItem("driveUploadFolderName");
    }
  }, [driveUploadFolderName, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (selectedDriveFolderId) {
      localStorage.setItem("sheetsDriveFolderId", selectedDriveFolderId);
    } else {
      localStorage.removeItem("sheetsDriveFolderId");
    }
  }, [selectedDriveFolderId, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (selectedDriveFolderName) {
      localStorage.setItem("sheetsDriveFolderName", selectedDriveFolderName);
    } else {
      localStorage.removeItem("sheetsDriveFolderName");
    }
  }, [selectedDriveFolderName, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (selectedDropboxFolderPath) {
      localStorage.setItem("sheetsDropboxFolderPath", selectedDropboxFolderPath);
    } else {
      localStorage.removeItem("sheetsDropboxFolderPath");
    }
  }, [selectedDropboxFolderPath, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    localStorage.setItem("csvSource", csvSource);
  }, [csvSource, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    localStorage.setItem("folderSource", uploadSource);
  }, [uploadSource, isHydrated]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || isInitialLoadRef.current) return;
    
    if (videosPerDay) {
      localStorage.setItem("videosPerDay", videosPerDay);
    } else {
      localStorage.removeItem("videosPerDay");
    }
  }, [videosPerDay, isHydrated]);

  const handleConnectDropbox = async () => {
    try {
      const response = await fetch('/api/auth/dropbox/url');
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        setShowToast({ message: data.error || "Failed to get Dropbox auth URL", type: "error" });
      }
    } catch (error: any) {
      setShowToast({ message: "Failed to connect Dropbox", type: "error" });
    }
  };

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

      {showDropboxBrowser && (
        <DropboxBrowser
          mode={dropboxBrowserMode}
          fileFilter={dropboxBrowserMode === "file" ? "spreadsheet" : "video"}
          onSelectFolder={(folderPath, folderName) => {
            // Handle folder selection based on context
            if (dropboxBrowserContext === "sheets-folder") {
              // Update sheets Dropbox folder input
              setSelectedDropboxFolderPath(folderPath);
              if (typeof window !== "undefined") {
                localStorage.setItem("sheetsDropboxFolderPath", folderPath);
              }
            } else {
              // Update bulk upload input
              setDropboxUploadFolderPath(folderPath);
              if (typeof window !== "undefined") {
                localStorage.setItem("dropboxUploadFolderPath", folderPath);
              }
            }
            
            setShowToast({ message: `Selected folder: ${folderName}`, type: "success" });
            setShowDropboxBrowser(false);
          }}
          onSelectFile={(filePath, fileName) => {
            // Handle file selection based on context
            if (dropboxBrowserContext === "sheets-file") {
              // CSV file selection
              setSelectedDropboxCsvFile(filePath);
              if (typeof window !== "undefined") {
                localStorage.setItem("selectedDropboxCsvFile", filePath);
              }
            } else {
              // Spreadsheet file selection (for future use)
              setSelectedDropboxFile(filePath);
              if (typeof window !== "undefined") {
                localStorage.setItem("dropboxSpreadsheetFile", filePath);
              }
            }
            setShowToast({ message: `Selected file: ${fileName}`, type: "success" });
            setShowDropboxBrowser(false);
          }}
          onClose={() => setShowDropboxBrowser(false)}
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



      {/* Unified Upload Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📤</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Upload Videos
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
                <strong>📤 Upload Videos:</strong> Upload multiple videos from Google Drive or Dropbox folders. Optionally provide Google Sheets or CSV files for metadata. Videos stream directly to YouTube - no disk storage needed! Uploads are processed in the background.
              </p>
            </div>

            {/* Unified Upload Source Selector */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
              <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 block mb-3">
                Select Upload Source:
              </label>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadSource"
                    value="drive"
                    checked={uploadSource === "drive"}
                    onChange={(e) => {
                      setUploadSource("drive");
                      if (typeof window !== "undefined") {
                        localStorage.setItem("folderSource", "drive");
                        localStorage.removeItem("sheetsUploadSource");
                      }
                    }}
                    className="w-4 h-4 text-green-600"
                  />
                  <span className="text-sm text-purple-800 dark:text-purple-200">
                    📁 Google Drive
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadSource"
                    value="dropbox"
                    checked={uploadSource === "dropbox"}
                    onChange={(e) => {
                      setUploadSource("dropbox");
                      if (typeof window !== "undefined") {
                        localStorage.setItem("folderSource", "dropbox");
                        localStorage.removeItem("sheetsUploadSource");
                      }
                    }}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-purple-800 dark:text-purple-200">
                    📦 Dropbox
                  </span>
                </label>
              </div>
            </div>

            <form onSubmit={handleBulkUpload} className="flex flex-col gap-5">

              {/* Google Drive Folder Upload */}
              {uploadSource === "drive" && (
              <>
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

              {/* Google Sheets for Metadata (Drive) */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xl">📊</span>
                  <div className="flex-1">
                    <strong className="text-indigo-900 dark:text-indigo-100 block mb-1">
                      Google Sheets for Metadata (Optional)
                    </strong>
                    <p className="text-sm text-indigo-800 dark:text-indigo-200 mb-3">
                      Optionally provide a Google Sheet with video metadata. The sheet should have columns like youtube_title, youtube_description, video_url, drive_file_id, etc.
                    </p>
                    <div>
                      <label htmlFor="driveSpreadsheetUrl" className="label text-sm">
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
                                localStorage.setItem("sheetsSpreadsheetUrl", url);
                              } else {
                                localStorage.removeItem("sheetsSpreadsheetUrl");
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
                            const input = document.getElementById('driveSpreadsheetUrl') as HTMLInputElement;
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
                          <label htmlFor="driveSheetName" className="text-xs block mb-1">
                            Select Sheet:
                          </label>
                          <select
                            id="driveSheetName"
                            name="driveSheetName"
                            className="input-field text-sm"
                          >
                            <option value="">Select a sheet...</option>
                            {availableSheets.map((sheet) => (
                              <option key={sheet.sheetId} value={sheet.title}>
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
                      Optionally provide a CSV file with video metadata. The CSV should have columns like youtube_title, youtube_description, video_url, drive_file_id, etc.
                    </p>
                    <div>
                      <label htmlFor="driveCsvFile" className="label text-sm">
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

              {/* Dropbox Folder Upload */}
              {uploadSource === "dropbox" && (
              <>
              <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xl">📦</span>
                  <div className="flex-1">
                    <strong className="text-blue-900 dark:text-blue-100 block mb-1">
                      Upload from Dropbox Folder
                    </strong>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      Upload all videos from a Dropbox folder. Supports recursive folder scanning and post-upload actions.
                    </p>
                    {/* Auth overlay - shown over the form when not authenticated */}
                    {hasDropboxAuth !== true && (
                      <div className="mb-3 p-3 bg-blue-100 dark:bg-blue-800/50 border border-blue-300 dark:border-blue-600 rounded-lg">
                        {hasDropboxAuth === null ? (
                          <p className="text-sm text-gray-600 dark:text-gray-300 animate-pulse">
                            Checking Dropbox connection...
                          </p>
                        ) : (
                          <>
                            <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">
                              Connect your Dropbox account to use Dropbox folders
                            </p>
                            <button
                              type="button"
                              onClick={handleConnectDropbox}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                            >
                              <span>🔗</span>
                              <span>Connect Dropbox</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* Always render the form inputs so values persist */}
                    <div className={hasDropboxAuth !== true ? "opacity-50 pointer-events-none" : ""}>
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
                                localStorage.setItem("dropboxUploadFolderPath", e.target.value);
                              } else {
                                localStorage.removeItem("dropboxUploadFolderPath");
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
                              const input = document.getElementById('dropboxFolderPath') as HTMLInputElement;
                              if (input) input.value = "";
                              if (typeof window !== "undefined") {
                                localStorage.removeItem("dropboxUploadFolderPath");
                              }
                            }}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Clear"
                          >
                            ✕
                          </button>
                        )}
                      </div>
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
                            <label htmlFor="dropboxPostAction" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">
                              Post-upload action:
                            </label>
                            <select
                              id="dropboxPostAction"
                              className="input-field text-sm py-1"
                              defaultValue="none"
                              onChange={(e) => {
                                const moveFolder = document.getElementById('dropboxMoveFolder');
                                if (moveFolder) {
                                  moveFolder.classList.toggle('hidden', e.target.value !== 'move');
                                }
                              }}
                            >
                              <option value="none">None</option>
                              <option value="rename">Rename to video ID</option>
                              <option value="delete">Delete from Dropbox</option>
                              <option value="move">Move to folder</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="dropboxPrivacy" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">
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
                          <label htmlFor="dropboxCompletedFolder" className="text-xs text-blue-700 dark:text-blue-300 block mb-1">
                            Completed folder path (for move action):
                          </label>
                          <input
                            type="text"
                            id="dropboxCompletedFolder"
                            placeholder="/Completed or /Uploaded"
                            className="input-field text-sm font-mono"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                        💡 Enter Dropbox folder path starting with <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/</code> (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/Videos</code> or <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/My Videos/Uploads</code>)
                      </p>
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
                      Optionally provide a CSV or XLSX file from Dropbox with video metadata. The file should have columns like youtube_title, youtube_description, video_url, etc.
                    </p>
                    {/* Always render inputs, but disable if not authenticated */}
                    <div className={hasDropboxAuth !== true ? "opacity-50 pointer-events-none" : ""}>
                      <label htmlFor="dropboxMetadataCsvFile" className="label text-sm">
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
                                localStorage.setItem("selectedDropboxCsvFile", e.target.value);
                              } else {
                                localStorage.removeItem("selectedDropboxCsvFile");
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
                              if (typeof window !== "undefined") {
                                localStorage.removeItem("selectedDropboxCsvFile");
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
                          ✓ Selected: <strong>{selectedDropboxCsvFile}</strong>
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Click <strong>Browse</strong> to select a CSV or XLSX file from Dropbox, or enter the file path manually
                      </p>
                    </div>
                    {hasDropboxAuth !== true && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          {hasDropboxAuth === null ? "Checking Dropbox connection..." : "Connect your Dropbox account above to enable file selection"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dropbox Upload Button */}
              <button
                type="button"
                onClick={async () => {
                  const folderPath = (document.getElementById('dropboxFolderPath') as HTMLInputElement)?.value?.trim();
                  if (!folderPath) {
                    setShowToast({ message: "Please enter a Dropbox folder path", type: "error" });
                    return;
                  }
                  try {
                    // Get videosPerDay from state
                    const videosPerDayNum = videosPerDay ? parseInt(videosPerDay, 10) : undefined;
                    if (videosPerDayNum !== undefined && (isNaN(videosPerDayNum) || videosPerDayNum < 0)) {
                      setShowToast({ message: "Videos per day must be a positive number", type: "error" });
                      return;
                    }
                    
                    const response = await fetch('/api/upload-dropbox', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        dropboxFolderPath: folderPath,
                        recursive: (document.getElementById('dropboxRecursive') as HTMLInputElement)?.checked || false,
                        postUploadAction: (document.getElementById('dropboxPostAction') as HTMLSelectElement)?.value || 'none',
                        completedFolderPath: (document.getElementById('dropboxCompletedFolder') as HTMLInputElement)?.value?.trim() || undefined,
                        privacyStatus: (document.getElementById('dropboxPrivacy') as HTMLSelectElement)?.value || 'public',
                        videosPerDay: videosPerDayNum && videosPerDayNum > 0 ? videosPerDayNum : undefined,
                        dropboxCsvPath: selectedDropboxCsvFile || undefined, // Include CSV file path if provided
                        useWorker: true,
                      }),
                    });
                    const data = await response.json();
                    if (response.ok) {
                      setShowToast({ message: `Upload queued: ${data.totalItems} videos from "${data.folderPath}"`, type: "success" });
                      setDropboxUploadFolderPath("");
                      setSelectedDropboxCsvFile("");
                      (document.getElementById('dropboxFolderPath') as HTMLInputElement).value = '';
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("dropboxUploadFolderPath");
                        localStorage.removeItem("selectedDropboxCsvFile");
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
                      setShowToast({ message: data.error || "Failed to queue Dropbox upload", type: "error" });
                    }
                  } catch (error: any) {
                    setShowToast({ message: `Error: ${error.message}`, type: "error" });
                  }
                }}
                disabled={!dropboxUploadFolderPath || hasDropboxAuth !== true}
                className="btn-primary w-full"
              >
                Upload from Dropbox
              </button>
              </>
              )}

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

              {(uploadSource === "drive" || uploadSource === "dropbox") && (
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
              )}
            </form>

            {/* Global Upload Scheduling */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📅</span>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  Upload Scheduling (Optional)
                </h3>
              </div>
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
                <strong>Note:</strong> This setting applies to all upload methods (Sheets, Dropbox, CSV). 
                If a video has a <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">scheduleTime</code> or <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">publishAt</code> date in your sheet/CSV, that date will be used instead.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

