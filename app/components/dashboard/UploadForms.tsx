"use client";

import {
  FormEvent,
  RefObject,
  useState,
  useRef,
  useEffect,
} from "react";
import UploadFormsBrowserOverlays from "./UploadFormsBrowserOverlays";
import UploadFormsBulkSection from "./UploadFormsBulkSection";
import UploadFormsSingleVideoCard from "./UploadFormsSingleVideoCard";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import { useAppToast } from "@/app/app-toast-context";
import { useDropboxAuth } from "./DropboxAuthContext";
import { useDropboxQueueSource } from "@/app/dashboard/hooks/useDropboxQueueSource";
import { useSheetsMetadata } from "@/app/dashboard/hooks/useSheetsMetadata";

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
  checkDuplicatesBeforeUpload: boolean;
  setCheckDuplicatesBeforeUpload: (value: boolean) => void;

  // Queue management callbacks
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;

  /** Global upload schedule (from dashboard; persisted in localStorage by parent) */
  schedulingEnabled?: boolean;
  globalVideosPerDay?: string;
  /** When incremented (e.g. from Queue mode), opens the Dropbox folder browser for bulk/queue pick. */
  openDropboxQueuePickerNonce?: number;
}

export default function UploadForms({
  showSingleUpload,
  toggleSingleUpload,
  handleSingleUpload,
  selectedVideoFile,
  setSelectedVideoFile,
  fileInputRef,
  uploading,
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
  checkDuplicatesBeforeUpload,
  setCheckDuplicatesBeforeUpload,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  schedulingEnabled = false,
  globalVideosPerDay = "",
  openDropboxQueuePickerNonce = 0,
}: UploadFormsProps) {
  const showAppToast = useAppToast();
  const [isHydrated, setIsHydrated] = useState(false);
  const isInitialLoadRef = useRef(true); // Track if we're still loading initial values
  const hasRestoredRef = useRef(false); // Track if we've restored values after mount
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [showDropboxBrowser, setShowDropboxBrowser] = useState(false);
  const [dropboxBrowserMode, setDropboxBrowserMode] = useState<
    "folder" | "file"
  >("folder");
  const [dropboxBrowserContext, setDropboxBrowserContext] = useState<
    "bulk" | "sheets-folder" | "sheets-file" | "thumbnails-folder"
  >("bulk");
  const [dropboxThumbnailsFolderPath, setDropboxThumbnailsFolderPath] =
    useState<string>("");
  const [showSheetsBrowser, setShowSheetsBrowser] = useState(false);
  const [selectedDropboxFile, setSelectedDropboxFile] = useState<string>(""); // For spreadsheet file from Dropbox
  const [csvSource, setCsvSource] = useState<"local" | "dropbox">("local");
  const [selectedDropboxCsvFile, setSelectedDropboxCsvFile] =
    useState<string>("");
  const [dropboxSheetNames, setDropboxSheetNames] = useState<
    Array<{ title: string; sheetId: number }>
  >([]);
  const [selectedDropboxSheetName, setSelectedDropboxSheetName] =
    useState<string>("");
  const [loadingDropboxSheets, setLoadingDropboxSheets] = useState(false);
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedDriveFolderId, setSelectedDriveFolderId] =
    useState<string>("");
  const [selectedDriveFolderName, setSelectedDriveFolderName] =
    useState<string>("");
  const [selectedDropboxFolderPath, setSelectedDropboxFolderPath] =
    useState<string>("");
  const { hasDropboxAuth } = useDropboxAuth();
  // Unified upload source - Drive or Dropbox (default Dropbox when Drive/Sheets hidden)
  const [uploadSource, setUploadSource] = useState<"drive" | "dropbox">(
    HIDE_GOOGLE_DRIVE_SHEETS ? "dropbox" : "drive",
  );
  const [dropboxUploadFolderPath, setDropboxUploadFolderPath] =
    useState<string>("");
  const [driveUploadFolderId, setDriveUploadFolderId] = useState<string>("");
  const [driveUploadFolderName, setDriveUploadFolderName] =
    useState<string>("");
  const [driveBrowserContext, setDriveBrowserContext] = useState<
    "drive" | "sheets"
  >("drive");
  const [dropboxUploading, setDropboxUploading] = useState<boolean>(false);
  const [skipDuplicateTitles, setSkipDuplicateTitles] = useState<boolean>(true);

  const {
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
    fetchSheets,
    debounceTimerRef,
  } = useSheetsMetadata();

  const {
    dropboxPythonQueueMode,
    pythonQueueDetectInfo,
    handleBulkDropboxFolderSelected,
    clearDropboxPythonQueueMode,
  } = useDropboxQueueSource({
    setDropboxUploadFolderPath,
    setShowDropboxBrowser,
    hasDropboxAuth,
  });

  useEffect(() => {
    if (!openDropboxQueuePickerNonce) return;
    setDropboxBrowserMode("folder");
    setDropboxBrowserContext("bulk");
    setUploadSource("dropbox");
    setShowBulkUpload(true);
    setShowDropboxBrowser(true);
  }, [
    openDropboxQueuePickerNonce,
    setShowBulkUpload,
    setShowDropboxBrowser,
  ]);

  const handleDriveFolderSelect = (folderId: string, folderName: string) => {
    const input = document.getElementById("driveFolderId") as HTMLInputElement;
    if (input) {
      input.value = folderId;
    }
    setDriveUploadFolderId(folderId);
    setDriveUploadFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, folderId);
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderName, folderName);
    }
    showAppToast({
      message: `Selected folder: ${folderName}`,
      type: "success",
    });
  };

  const handleSheetsDriveFolderSelect = (
    folderId: string,
    folderName: string,
  ) => {
    setSelectedDriveFolderId(folderId);
    setSelectedDriveFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderId, folderId);
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderName, folderName);
    }
    showAppToast({
      message: `Selected Drive folder for matching: ${folderName}`,
      type: "success",
    });
  };

  // Load saved values from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSpreadsheetUrl = localStorage.getItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl);
      const savedSheetsDriveFolderId = localStorage.getItem(
        DASHBOARD_STORAGE.sheetsDriveFolderId,
      );
      const savedSheetsDriveFolderName = localStorage.getItem(
        DASHBOARD_STORAGE.sheetsDriveFolderName,
      );
      const savedDriveUploadFolderId = localStorage.getItem(
        DASHBOARD_STORAGE.driveUploadFolderId,
      );
      const savedDriveUploadFolderName = localStorage.getItem(
        DASHBOARD_STORAGE.driveUploadFolderName,
      );

      if (savedSpreadsheetUrl) {
        const input = document.getElementById(
          "spreadsheetUrl",
        ) as HTMLInputElement;
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
        const input = document.getElementById(
          "driveFolderId",
        ) as HTMLInputElement;
        if (input && !input.value) {
          input.value = savedDriveUploadFolderId;
        }
      }

      const savedDropboxFolderPath = localStorage.getItem(
        DASHBOARD_STORAGE.sheetsDropboxFolderPath,
      );
      if (savedDropboxFolderPath) {
        setSelectedDropboxFolderPath(savedDropboxFolderPath);
      }

      const savedDropboxUploadFolderPath = localStorage.getItem(
        DASHBOARD_STORAGE.dropboxUploadFolderPath,
      );
      if (savedDropboxUploadFolderPath) {
        setDropboxUploadFolderPath(savedDropboxUploadFolderPath);
      }
      const savedDropboxThumbnailsFolderPath = localStorage.getItem(
        DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
      );
      if (savedDropboxThumbnailsFolderPath) {
        setDropboxThumbnailsFolderPath(savedDropboxThumbnailsFolderPath);
      }

      const savedCsvSource = localStorage.getItem(DASHBOARD_STORAGE.csvSource);
      if (savedCsvSource === "local" || savedCsvSource === "dropbox") {
        setCsvSource(savedCsvSource);
      }

      const savedDropboxCsvFile = localStorage.getItem(
        DASHBOARD_STORAGE.selectedDropboxCsvFile,
      );
      if (savedDropboxCsvFile) {
        setSelectedDropboxCsvFile(savedDropboxCsvFile);
      }
      const savedDropboxSheet = localStorage.getItem(
        DASHBOARD_STORAGE.selectedDropboxSheetName,
      );
      if (savedDropboxSheet) {
        setSelectedDropboxSheetName(savedDropboxSheet);
      }

      // Load unified upload source (when Drive/Sheets hidden, always use dropbox)
      const savedFolderSource = localStorage.getItem(DASHBOARD_STORAGE.folderSource);
      const savedSheetsSource = localStorage.getItem(DASHBOARD_STORAGE.sheetsUploadSource);
      if (HIDE_GOOGLE_DRIVE_SHEETS) {
        setUploadSource("dropbox");
      } else if (
        savedFolderSource === "drive" ||
        savedFolderSource === "dropbox"
      ) {
        setUploadSource(savedFolderSource);
      } else if (savedSheetsSource === "sheets") {
        setUploadSource("drive");
        localStorage.setItem(DASHBOARD_STORAGE.folderSource, "drive");
      } else if (savedSheetsSource === "csv") {
        setUploadSource("drive");
        localStorage.setItem(DASHBOARD_STORAGE.folderSource, "drive");
      }

      const savedSkipDuplicateTitles = localStorage.getItem(
        DASHBOARD_STORAGE.dropboxSkipDuplicateTitles,
      );
      if (savedSkipDuplicateTitles !== null) {
        setSkipDuplicateTitles(savedSkipDuplicateTitles === "true");
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

  // Fetch Dropbox file sheet names when XLSX/XLS file is selected
  useEffect(() => {
    const path = selectedDropboxCsvFile?.trim() || "";
    if (!path) {
      setDropboxSheetNames([]);
      setSelectedDropboxSheetName("");
      return;
    }
    const ext = path.toLowerCase().split(".").pop() || "";
    if (ext === "csv") {
      setDropboxSheetNames([{ title: "Sheet1", sheetId: 0 }]);
      setSelectedDropboxSheetName((prev) => prev || "Sheet1");
      return;
    }
    if (ext !== "xlsx" && ext !== "xls") {
      setDropboxSheetNames([]);
      setSelectedDropboxSheetName("");
      return;
    }
    let cancelled = false;
    setLoadingDropboxSheets(true);
    fetch(
      `/api/dropbox-sheet-names?filePath=${encodeURIComponent(path)}`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const sheets = data.sheets || [];
        setDropboxSheetNames(sheets);
        if (sheets.length > 0) {
          setSelectedDropboxSheetName((prev) => {
            const exists = sheets.some(
              (s: { title: string }) => s.title === prev,
            );
            return exists ? prev : sheets[0].title;
          });
        } else {
          setSelectedDropboxSheetName("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDropboxSheetNames([]);
          setSelectedDropboxSheetName("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDropboxSheets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDropboxCsvFile]);

  // Reload Dropbox input values from localStorage when auth becomes available
  // This prevents values from being lost during token refresh/auth state changes
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (hasDropboxAuth !== true) return; // Only reload when auth is confirmed

    // Reload values from localStorage to ensure they persist through auth state changes
    const savedDropboxFolderPath = localStorage.getItem(
      DASHBOARD_STORAGE.dropboxUploadFolderPath,
    );
    if (savedDropboxFolderPath && !dropboxUploadFolderPath) {
      setDropboxUploadFolderPath(savedDropboxFolderPath);
    }

    const savedDropboxCsvFile = localStorage.getItem(DASHBOARD_STORAGE.selectedDropboxCsvFile);
    if (savedDropboxCsvFile && !selectedDropboxCsvFile) {
      setSelectedDropboxCsvFile(savedDropboxCsvFile);
    }
  }, [hasDropboxAuth, isHydrated]); // Only run when auth state changes

  // Auto-save to localStorage on state changes (after hydration)
  // Skip during initial load to prevent clearing values that were just loaded
  // Only save, never clear - clearing is done explicitly by user action
  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    // Only save if there's a value - don't clear on empty (might be temporary during re-render)
    if (dropboxUploadFolderPath && dropboxUploadFolderPath.trim()) {
      localStorage.setItem(DASHBOARD_STORAGE.dropboxUploadFolderPath, dropboxUploadFolderPath);
    }
    // Note: We don't remove from localStorage here - that's done explicitly by user via clear button
  }, [dropboxUploadFolderPath, isHydrated]); // Include isHydrated but check isInitialLoadRef

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    // Only save if there's a value - don't clear on empty (might be temporary during re-render)
    if (selectedDropboxCsvFile && selectedDropboxCsvFile.trim()) {
      localStorage.setItem(DASHBOARD_STORAGE.selectedDropboxCsvFile, selectedDropboxCsvFile);
    }
    // Note: We don't remove from localStorage here - that's done explicitly by user via clear button
  }, [selectedDropboxCsvFile, isHydrated]); // Include isHydrated but check isInitialLoadRef

  // Auto-save Dropbox thumbnails folder path when it changes (persist on tab switch)
  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;
    if (dropboxThumbnailsFolderPath && dropboxThumbnailsFolderPath.trim()) {
      localStorage.setItem(
        DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
        dropboxThumbnailsFolderPath,
      );
    }
  }, [dropboxThumbnailsFolderPath, isHydrated]);

  // On unmount (e.g. user switches tab), save all Dropbox form inputs to localStorage
  // Read from DOM for the two path inputs so we capture the latest typed value even if state hasn't updated yet
  useEffect(() => {
    return () => {
      try {
        if (typeof window === "undefined") return;
        const folderEl = document.getElementById(
          "dropboxFolderPath",
        ) as HTMLInputElement | null;
        if (folderEl && folderEl.value !== undefined) {
          const v = folderEl.value?.trim() ?? "";
          if (v) localStorage.setItem(DASHBOARD_STORAGE.dropboxUploadFolderPath, v);
          else localStorage.removeItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
        } else {
          localStorage.setItem(
            DASHBOARD_STORAGE.dropboxUploadFolderPath,
            dropboxUploadFolderPath || "",
          );
        }
        const thumbEl = document.getElementById(
          DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
        ) as HTMLInputElement | null;
        if (thumbEl && thumbEl.value !== undefined) {
          const v = thumbEl.value?.trim() ?? "";
          if (v) localStorage.setItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath, v);
          else localStorage.removeItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath);
        } else {
          localStorage.setItem(
            DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
            dropboxThumbnailsFolderPath || "",
          );
        }
        if (selectedDropboxCsvFile)
          localStorage.setItem(
            DASHBOARD_STORAGE.selectedDropboxCsvFile,
            selectedDropboxCsvFile,
          );
        if (selectedDropboxSheetName)
          localStorage.setItem(
            DASHBOARD_STORAGE.selectedDropboxSheetName,
            selectedDropboxSheetName,
          );
        const recursiveEl = document.getElementById(
          DASHBOARD_STORAGE.dropboxRecursive,
        ) as HTMLInputElement | null;
        if (recursiveEl && recursiveEl.checked !== undefined)
          localStorage.setItem(
            DASHBOARD_STORAGE.dropboxRecursive,
            recursiveEl.checked ? "true" : "false",
          );
        const postActionEl = document.getElementById(
          DASHBOARD_STORAGE.dropboxPostAction,
        ) as HTMLSelectElement | null;
        if (postActionEl && postActionEl.value !== undefined)
          localStorage.setItem(DASHBOARD_STORAGE.dropboxPostAction, postActionEl.value);
        const privacyEl = document.getElementById(
          DASHBOARD_STORAGE.dropboxPrivacy,
        ) as HTMLSelectElement | null;
        if (privacyEl && privacyEl.value !== undefined)
          localStorage.setItem(DASHBOARD_STORAGE.dropboxPrivacy, privacyEl.value);
        const completedEl = document.getElementById(
          DASHBOARD_STORAGE.dropboxCompletedFolder,
        ) as HTMLInputElement | null;
        if (completedEl && completedEl.value !== undefined && completedEl.value)
          localStorage.setItem(DASHBOARD_STORAGE.dropboxCompletedFolder, completedEl.value);
      } catch (err) {
        console.warn("[UploadForms] Error saving form state on unmount:", err);
      }
    };
  });

  // Restore all Dropbox inputs from localStorage when component mounts (after tab switch)
  // This runs after hydration to ensure DOM is ready and state is initialized
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || hasRestoredRef.current)
      return;

    const restoreValues = () => {
      // Restore controlled inputs (state) - ensure they're set even if initial load missed them
      const savedDropboxUploadFolderPath = localStorage.getItem(
        DASHBOARD_STORAGE.dropboxUploadFolderPath,
      );
      if (savedDropboxUploadFolderPath) {
        setDropboxUploadFolderPath(savedDropboxUploadFolderPath);
      }

      const savedDropboxThumbnailsFolderPath = localStorage.getItem(
        DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
      );
      if (savedDropboxThumbnailsFolderPath) {
        setDropboxThumbnailsFolderPath(savedDropboxThumbnailsFolderPath);
      }

      // Restore uncontrolled inputs (DOM) - retry until elements exist
      const recursive = localStorage.getItem(DASHBOARD_STORAGE.dropboxRecursive);
      const rEl = document.getElementById(
        DASHBOARD_STORAGE.dropboxRecursive,
      ) as HTMLInputElement | null;
      if (rEl && recursive !== null) {
        rEl.checked = recursive === "true";
      }

      const postAction = localStorage.getItem(DASHBOARD_STORAGE.dropboxPostAction);
      const pEl = document.getElementById(
        DASHBOARD_STORAGE.dropboxPostAction,
      ) as HTMLSelectElement | null;
      if (pEl && postAction) {
        pEl.value = postAction;
      }

      const privacy = localStorage.getItem(DASHBOARD_STORAGE.dropboxPrivacy);
      const prEl = document.getElementById(
        DASHBOARD_STORAGE.dropboxPrivacy,
      ) as HTMLSelectElement | null;
      if (prEl && privacy) {
        prEl.value = privacy;
      }

      const completed = localStorage.getItem(DASHBOARD_STORAGE.dropboxCompletedFolder);
      const cEl = document.getElementById(
        DASHBOARD_STORAGE.dropboxCompletedFolder,
      ) as HTMLInputElement | null;
      if (cEl && completed) {
        cEl.value = completed;
      }

      // If elements don't exist yet, retry after a longer delay
      if (!rEl || !pEl || !prEl) {
        return false; // Indicate we need to retry
      }
      return true; // All elements found
    };

    // Try immediately, then retry with increasing delays if elements aren't ready
    let attempts = 0;
    const maxAttempts = 5;
    const delays = [100, 200, 500, 1000, 2000]; // Progressive delays

    const tryRestore = () => {
      attempts++;
      const success = restoreValues();
      if (success) {
        hasRestoredRef.current = true;
      } else if (attempts < maxAttempts) {
        setTimeout(tryRestore, delays[attempts - 1] || 2000);
      } else {
        hasRestoredRef.current = true; // Give up after max attempts
      }
    };

    const t = setTimeout(tryRestore, 100);
    return () => {
      clearTimeout(t);
      // Reset on unmount so we restore again when component remounts
      hasRestoredRef.current = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    if (driveUploadFolderId) {
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, driveUploadFolderId);
    } else {
      localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderId);
    }
  }, [driveUploadFolderId, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    if (driveUploadFolderName) {
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderName, driveUploadFolderName);
    } else {
      localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderName);
    }
  }, [driveUploadFolderName, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    if (selectedDriveFolderId) {
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderId, selectedDriveFolderId);
    } else {
      localStorage.removeItem(DASHBOARD_STORAGE.sheetsDriveFolderId);
    }
  }, [selectedDriveFolderId, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    if (selectedDriveFolderName) {
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderName, selectedDriveFolderName);
    } else {
      localStorage.removeItem(DASHBOARD_STORAGE.sheetsDriveFolderName);
    }
  }, [selectedDriveFolderName, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    if (selectedDropboxFolderPath) {
      localStorage.setItem(
        DASHBOARD_STORAGE.sheetsDropboxFolderPath,
        selectedDropboxFolderPath,
      );
    } else {
      localStorage.removeItem(DASHBOARD_STORAGE.sheetsDropboxFolderPath);
    }
  }, [selectedDropboxFolderPath, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    localStorage.setItem(DASHBOARD_STORAGE.csvSource, csvSource);
  }, [csvSource, isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      typeof window === "undefined" ||
      isInitialLoadRef.current
    )
      return;

    localStorage.setItem(DASHBOARD_STORAGE.folderSource, uploadSource);
  }, [uploadSource, isHydrated]);

  const handleSheetSelect = async (
    spreadsheetId: string,
    spreadsheetName: string,
  ) => {
    const input = document.getElementById("spreadsheetUrl") as HTMLInputElement;
    if (input) {
      // Set the spreadsheet ID in the input
      input.value = spreadsheetId;
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl, spreadsheetId);
      }
      // Trigger the fetch to load sheets
      await fetchSheets(spreadsheetId);
    }
    showAppToast({
      message: `Selected sheet: ${spreadsheetName}`,
      type: "success",
    });
  };

  const handlePreviewSheet = async () => {
    const spreadsheetUrlInput = document.getElementById(
      "spreadsheetUrl",
    ) as HTMLInputElement;
    const sheetNameSelect = document.getElementById(
      "sheetName",
    ) as HTMLSelectElement;
    const rangeInput = document.getElementById("range") as HTMLInputElement;

    const spreadsheetUrl = spreadsheetUrlInput?.value.trim();
    const sheetName = sheetNameSelect?.value.trim();
    const range = rangeInput?.value.trim() || undefined;

    if (!spreadsheetUrl) {
      showAppToast({
        message: "Please enter or select a Google Sheets URL/ID first",
        type: "error",
      });
      return;
    }

    if (!sheetName) {
      showAppToast({ message: "Please select a sheet first", type: "error" });
      return;
    }

    setLoadingPreview(true);
    try {
      const response = await fetch("/api/preview-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        showAppToast({
          message: data.error || "Failed to preview sheet",
          type: "error",
        });
      }
    } catch (error: any) {
      showAppToast({
        message: `Error: ${error.message}`,
        type: "error",
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <>
      <UploadFormsBrowserOverlays
        showDriveBrowser={showDriveBrowser}
        setShowDriveBrowser={setShowDriveBrowser}
        driveBrowserContext={driveBrowserContext}
        handleSheetsDriveFolderSelect={handleSheetsDriveFolderSelect}
        handleDriveFolderSelect={handleDriveFolderSelect}
        showDropboxBrowser={showDropboxBrowser}
        setShowDropboxBrowser={setShowDropboxBrowser}
        dropboxBrowserMode={dropboxBrowserMode}
        dropboxBrowserContext={dropboxBrowserContext}
        handleBulkDropboxFolderSelected={handleBulkDropboxFolderSelected}
        setSelectedDropboxFolderPath={setSelectedDropboxFolderPath}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        setDropboxUploadFolderPath={setDropboxUploadFolderPath}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        setSelectedDropboxFile={setSelectedDropboxFile}
        showSheetsBrowser={showSheetsBrowser}
        setShowSheetsBrowser={setShowSheetsBrowser}
        handleSheetSelect={handleSheetSelect}
        showSheetPreview={showSheetPreview}
        previewData={previewData}
        onCloseSheetPreview={() => {
          setShowSheetPreview(false);
          setPreviewData(null);
        }}
      />
      <UploadFormsSingleVideoCard
        showSingleUpload={showSingleUpload}
        toggleSingleUpload={toggleSingleUpload}
        handleSingleUpload={handleSingleUpload}
        selectedVideoFile={selectedVideoFile}
        setSelectedVideoFile={setSelectedVideoFile}
        fileInputRef={fileInputRef}
        uploading={uploading}
      />
      <UploadFormsBulkSection
        showBulkUpload={showBulkUpload}
        setShowBulkUpload={setShowBulkUpload}
        handleBulkUpload={handleBulkUpload}
        uploadSource={uploadSource}
        setUploadSource={setUploadSource}
        driveUploadFolderId={driveUploadFolderId}
        setDriveUploadFolderId={setDriveUploadFolderId}
        setDriveUploadFolderName={setDriveUploadFolderName}
        setDriveBrowserContext={setDriveBrowserContext}
        setShowDriveBrowser={setShowDriveBrowser}
        setShowSheetsBrowser={setShowSheetsBrowser}
        dropboxPythonQueueMode={dropboxPythonQueueMode}
        pythonQueueDetectInfo={pythonQueueDetectInfo}
        dropboxUploadFolderPath={dropboxUploadFolderPath}
        setDropboxUploadFolderPath={setDropboxUploadFolderPath}
        setDropboxBrowserMode={setDropboxBrowserMode}
        setDropboxBrowserContext={setDropboxBrowserContext}
        setShowDropboxBrowser={setShowDropboxBrowser}
        clearDropboxPythonQueueMode={clearDropboxPythonQueueMode}
        skipDuplicateTitles={skipDuplicateTitles}
        setSkipDuplicateTitles={setSkipDuplicateTitles}
        dropboxThumbnailsFolderPath={dropboxThumbnailsFolderPath}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        selectedDropboxCsvFile={selectedDropboxCsvFile}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        dropboxSheetNames={dropboxSheetNames}
        setDropboxSheetNames={setDropboxSheetNames}
        loadingDropboxSheets={loadingDropboxSheets}
        selectedDropboxSheetName={selectedDropboxSheetName}
        setSelectedDropboxSheetName={setSelectedDropboxSheetName}
        dropboxUploading={dropboxUploading}
        setDropboxUploading={setDropboxUploading}
        schedulingEnabled={schedulingEnabled}
        globalVideosPerDay={globalVideosPerDay}
        checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
        setCheckDuplicatesBeforeUpload={setCheckDuplicatesBeforeUpload}
        setSelectedJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
        bulkUploadProgress={bulkUploadProgress}
        bulkUploading={bulkUploading}
        selectedBulkFiles={selectedBulkFiles}
        bulkUrls={bulkUrls}
        debounceTimerRef={debounceTimerRef}
        fetchSheets={fetchSheets}
        availableSheets={availableSheets}
        setAvailableSheets={setAvailableSheets}
        loadingSheets={loadingSheets}
        spreadsheetTitle={spreadsheetTitle}
        setSpreadsheetTitle={setSpreadsheetTitle}
      />
    </>
  );
}
