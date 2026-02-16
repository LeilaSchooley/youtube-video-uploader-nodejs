"use client";

/**
 * Dashboard Page - Main upload management interface
 *
 * Refactored: Extracted components to reduce file size from 4087 to 1824 lines:
 * - Statistics component - extracted to app/components/dashboard/Statistics.tsx
 * - UploadForms component - extracted to app/components/dashboard/UploadForms.tsx
 * - QueueManagement component - extracted to app/components/dashboard/QueueManagement.tsx
 */

import {
  useEffect,
  useState,
  FormEvent,
  ChangeEvent,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "@/app/components/Toast";
import ConfirmModal from "@/app/components/ConfirmModal";
import Header from "@/app/components/dashboard/Header";
import Statistics from "@/app/components/dashboard/Statistics";
import UploadForms from "@/app/components/dashboard/UploadForms";
import QueueManagement from "@/app/components/dashboard/QueueManagement";
import UploadSummary from "@/app/components/dashboard/UploadSummary";
import Tabs from "@/app/components/dashboard/Tabs";
import type { User } from "@/app/components/dashboard/types";
import { useConfirmModal } from "@/app/dashboard/hooks/useConfirmModal";
import { useQueue } from "@/app/dashboard/hooks/useQueue";
import { useBulkUpload } from "@/app/dashboard/hooks/useBulkUpload";

// User interface moved to types.ts

interface Message {
  type: "success" | "error" | "info" | null;
  text: string | null;
}

interface ProgressItem {
  index: number;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [csvUploading, setCsvUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<Message>({ type: null, text: null });
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [videosPerDay, setVideosPerDay] = useState<string>("");
  const [enableScheduling, setEnableScheduling] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const bulkFilesInputRef = useRef<HTMLInputElement>(null);

  const { confirmModal, requestConfirm, closeConfirmModal } = useConfirmModal();
  const queueState = useQueue({
    setShowToast: (t) => setShowToast(t),
    requestConfirm,
  });
  const {
    queue,
    setQueue,
    selectedJobId,
    setSelectedJobId,
    jobStatus,
    setJobStatus,
    jobFiles,
    loadingFiles,
    searchQuery,
    setSearchQuery,
    nextUploadTime,
    timeUntilNext,
    fetchQueue,
    fetchJobStatus,
    fetchJobFiles,
    handleQueueAction,
    handleDeleteFile,
    handleDeleteAllFiles,
  } = queueState;
  const bulkUpload = useBulkUpload({
    setShowToast: (t) => setShowToast(t),
    setMessage,
    bulkFilesInputRef,
  });
  const {
    selectedBulkFiles,
    setSelectedBulkFiles,
    bulkUrls,
    setBulkUrls,
    urlAuthHeaders,
    setUrlAuthHeaders,
    urlTimeout,
    setUrlTimeout,
    bulkUploading,
    bulkUploadProgress,
    checkDuplicatesBeforeUpload,
    setCheckDuplicatesBeforeUpload,
    duplicateModal,
    setDuplicateModal,
    doBulkSubmit,
    handleBulkUpload,
  } = bulkUpload;

  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<
    Array<{ time: string; message: string; type: "info" | "success" | "error" }>
  >([]);
  const [availableChannels, setAvailableChannels] = useState<
    Array<{
      userId: string;
      displayName: string;
      fileCount: number;
      jobCount: number;
      isCurrent: boolean;
    }>
  >([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<{
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
  } | null>(null);
  const [uploadProgressInterval, setUploadProgressInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [csvValidationErrors, setCsvValidationErrors] = useState<string[]>([]);
  const [showSingleUpload, setShowSingleUpload] = useState<boolean>(false); // Collapsed by default
  const [showBatchUpload, setShowBatchUpload] = useState<boolean>(true); // Expanded by default
  const [showBulkUpload, setShowBulkUpload] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [showBatchInstructions, setShowBatchInstructions] =
    useState<boolean>(false); // Collapsed by default
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Add debug log helper
  const addDebugLog = useCallback(
    (message: string, type: "info" | "success" | "error" = "info") => {
      const logEntry = {
        time: new Date().toLocaleTimeString(),
        message,
        type,
      };
      setDebugLogs((prev) => [...prev.slice(-49), logEntry]); // Keep last 50 logs
    },
    [],
  );

  // CSV validation function
  const validateCsv = async (file: File): Promise<string[]> => {
    const errors: string[] = [];
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        errors.push("CSV must have at least a header row and one data row");
        return errors;
      }

      const headers = lines[0]
        .toLowerCase()
        .split(",")
        .map((h) => h.trim().replace(/"/g, ""));
      const requiredHeaders = ["youtube_title", "youtube_description", "path"];
      const missingHeaders = requiredHeaders.filter(
        (req) => !headers.includes(req.toLowerCase()),
      );

      if (missingHeaders.length > 0) {
        errors.push(`Missing required columns: ${missingHeaders.join(", ")}`);
      }

      // Check data rows (first 5 rows for preview)
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = lines[i]
          .split(",")
          .map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || "";
        });

        if (!row.youtube_title || !row.youtube_title.trim()) {
          errors.push(`Row ${i + 1}: Missing youtube_title`);
        }
        if (!row.youtube_description || !row.youtube_description.trim()) {
          errors.push(`Row ${i + 1}: Missing youtube_description`);
        }
        // Check for video source: path, video_url, or drive_file_id
        if (
          !row.path?.trim() &&
          !row.video_url?.trim() &&
          !row.drive_file_id?.trim()
        ) {
          errors.push(
            `Row ${i + 1}: Missing video source (path, video_url, or drive_file_id)`,
          );
        }
      }
    } catch (error) {
      errors.push(
        `Error reading CSV: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
    return errors;
  };

  // Keyboard shortcuts (Ctrl+K only in development)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K: Toggle debug panel (dev only)
      if (
        process.env.NODE_ENV === "development" &&
        (e.ctrlKey || e.metaKey) &&
        e.key === "k"
      ) {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
      }
      // Ctrl/Cmd + E: Export stats
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        const exportBtn = document.querySelector(
          '[title="Export statistics as JSON"]',
        ) as HTMLButtonElement;
        if (exportBtn) exportBtn.click();
      }
      // Escape: Close job details
      if (e.key === "Escape" && selectedJobId) {
        setSelectedJobId(null);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedJobId]);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Load dark mode preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved === "true") {
      setDarkMode(true);
    }
  }, []);

  // Load single upload section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showSingleUpload");
    if (saved !== null) {
      setShowSingleUpload(saved === "true");
    }
  }, []);

  // Load batch upload section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showBatchUpload");
    if (saved !== null) {
      setShowBatchUpload(saved === "true");
    }
  }, []);

  // Real-time polling: Refresh all uploaded files automatically while uploads are active

  // Load batch instructions preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showBatchInstructions");
    if (saved !== null) {
      setShowBatchInstructions(saved === "true");
    }
  }, []);

  // Load Upload Videos (bulk) section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showBulkUpload");
    if (saved !== null) {
      setShowBulkUpload(saved === "true");
    }
  }, []);

  // Persist Upload Videos collapse state when it changes
  useEffect(() => {
    localStorage.setItem("showBulkUpload", String(showBulkUpload));
  }, [showBulkUpload]);

  // Load "check duplicates before upload" preference
  useEffect(() => {
    const saved = localStorage.getItem("checkDuplicatesBeforeUpload");
    if (saved !== null) {
      setCheckDuplicatesBeforeUpload(saved === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("checkDuplicatesBeforeUpload", String(checkDuplicatesBeforeUpload));
  }, [checkDuplicatesBeforeUpload]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem("darkMode", String(newMode));
  };

  const toggleSingleUpload = () => {
    const newState = !showSingleUpload;
    setShowSingleUpload(newState);
    localStorage.setItem("showSingleUpload", String(newState));
  };

  const toggleBatchUpload = () => {
    const newState = !showBatchUpload;
    setShowBatchUpload(newState);
    localStorage.setItem("showBatchUpload", String(newState));
  };

  const toggleBatchInstructions = () => {
    const newState = !showBatchInstructions;
    setShowBatchInstructions(newState);
    localStorage.setItem("showBatchInstructions", String(newState));
  };

  useEffect(() => {
    fetchUser();
    fetchAvailableChannels();
  }, []);

  const fetchAvailableChannels = async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (res.ok && data.channels) {
        setAvailableChannels(data.channels);
        // Auto-select current channel if not already selected
        if (!selectedChannel && data.currentChannel) {
          setSelectedChannel(data.currentChannel);
        } else if (!selectedChannel && data.channels.length > 0) {
          // If no current channel, select the first one (usually the one with most files)
          setSelectedChannel(data.channels[0].userId);
        }
      }
    } catch (error) {
      console.error("[ERROR] Error fetching channels:", error);
    }
  };

  const handleChannelChange = (channelUserId: string) => {
    setSelectedChannel(channelUserId);
  };

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/user");
      const data = await res.json();
      if (data.authenticated) {
        setUser(data);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSingleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setMessage({ type: null, text: null });
    setSelectedVideoFile(null); // Reset file selection after upload starts

    // Store form reference before async operation
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "Video uploaded successfully!",
          type: "success",
        });
        setMessage({ type: null, text: null });
        // Reset form using stored reference
        if (form) {
          form.reset();
        }
      } else {
        console.error("=== UPLOAD ERROR (Client) ===");
        console.error("Error:", data.error);
        console.error("Details:", data.details);
        console.error("Code:", data.code);
        console.error("Status:", data.status);
        console.error("Full response:", data);
        console.error("=============================");

        const errorMsg = data.error || "Error uploading video";
        setShowToast({ message: errorMsg, type: "error" });
        setMessage({ type: "error", text: errorMsg });
      }
    } catch (error: any) {
      console.error("=== UPLOAD EXCEPTION (Client) ===");
      console.error("Error:", error);
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      console.error("=================================");

      const errorMsg =
        error?.message || "An error occurred while uploading the video.";
      setShowToast({ message: errorMsg, type: "error" });
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setUploading(false);
      // Reset file input after upload completes
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        setSelectedVideoFile(null);
      }
    }
  };

  const handleCsvUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCsvUploading(true);
    setMessage({ type: null, text: null });
    setShowProgress(false);
    setProgress([]);

    // Store form reference before async operation
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Add batch size (default: 5)
    const batchSize = 5; // Can be made configurable later
    formData.append("batchSize", batchSize.toString());

    try {
      setMessage({ type: "info", text: "Starting batch upload to YouTube..." });
      setUploadProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: "",
        message: "Connecting...",
        status: "copying",
      });

      const res = await fetch("/api/upload-queue", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Upload failed" }));
        throw new Error(errorData.error || "Upload failed");
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      // Read streaming response (Server-Sent Events)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let totalVideos = 0;
      let totalBatches = 0;
      let currentBatch = 0;
      let completed = 0;
      let failed = 0;
      let currentVideoIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "start":
                  totalVideos = data.total || 0;
                  totalBatches = data.totalBatches || 0;
                  setUploadProgress({
                    currentFile: 0,
                    totalFiles: totalVideos,
                    currentFileName: "",
                    message: `Starting upload: ${totalVideos} videos in ${totalBatches} batches`,
                    status: "uploading",
                  });
                  break;

                case "batch_start":
                  currentBatch = data.batchNumber || 0;
                  setUploadProgress({
                    currentFile: currentVideoIndex,
                    totalFiles: totalVideos,
                    currentFileName: `Batch ${currentBatch}/${totalBatches}`,
                    message: `Processing batch ${currentBatch}/${totalBatches} (${data.batchSize} videos)...`,
                    status: "uploading",
                  });
                  break;

                case "video_upload_start":
                  currentVideoIndex = data.index + 1;
                  setUploadProgress({
                    currentFile: currentVideoIndex,
                    totalFiles: totalVideos,
                    currentFileName: data.title || `Video ${currentVideoIndex}`,
                    message: `Uploading video ${currentVideoIndex}/${totalVideos}...`,
                    status: "uploading",
                  });
                  break;

                case "video_upload_success":
                  completed++;
                  setUploadProgress({
                    currentFile: currentVideoIndex,
                    totalFiles: totalVideos,
                    currentFileName: data.title || `Video ${currentVideoIndex}`,
                    message: `✓ Video ${currentVideoIndex}/${totalVideos} uploaded (ID: ${data.videoId?.substring(0, 8)}...)`,
                    status: "uploading",
                  });
                  break;

                case "video_upload_failed":
                  failed++;
                  setUploadProgress({
                    currentFile: currentVideoIndex,
                    totalFiles: totalVideos,
                    currentFileName: data.title || `Video ${currentVideoIndex}`,
                    message: `✗ Video ${currentVideoIndex}/${totalVideos} failed: ${data.error}`,
                    status: "uploading",
                  });
                  break;

                case "batch_complete":
                  setUploadProgress({
                    currentFile: completed + failed,
                    totalFiles: totalVideos,
                    currentFileName: `Batch ${currentBatch}/${totalBatches} complete`,
                    message: `Batch ${currentBatch}/${totalBatches}: ${data.completed} succeeded, ${data.failed} failed`,
                    status: "uploading",
                  });
                  break;

                case "overall_progress":
                  setUploadProgress({
                    currentFile: data.totalCompleted + data.totalFailed,
                    totalFiles: totalVideos,
                    currentFileName: "",
                    message: `Progress: ${data.totalCompleted} succeeded, ${data.totalFailed} failed (${data.progress}%)`,
                    status: "uploading",
                  });
                  break;

                case "final":
                  completed = data.totalCompleted || 0;
                  failed = data.totalFailed || 0;

                  let finalMessage = `✅ Upload Complete!\n\n`;
                  finalMessage += `📊 ${completed} videos uploaded successfully`;
                  if (failed > 0) {
                    finalMessage += `\n⚠️ ${failed} videos failed`;
                  }
                  if (data.invalidCount > 0) {
                    finalMessage += `\n⚠️ ${data.invalidCount} videos skipped (no matching files)`;
                  }

                  setShowToast({
                    message: finalMessage.trim(),
                    type: failed > 0 ? "info" : "success",
                  });
                  setMessage({
                    type: failed > 0 ? "info" : "success",
                    text: `✅ Upload complete: ${completed} succeeded${failed > 0 ? `, ${failed} failed` : ""}`,
                  });

                  // Reset form
                  if (form) {
                    form.reset();
                  }
                  setSelectedCsvFile(null);

                  // Refresh queue
                  fetchQueue();
                  break;

                case "error":
                  throw new Error(data.error || "Unknown error");

                case "complete":
                  // Stream completed
                  break;
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError, line);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("=== BULK UPLOAD ERROR ===");
      console.error("Error:", error);
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      console.error("==========================");

      const errorMsg =
        error?.message || "An error occurred while uploading files.";
      setShowToast({ message: errorMsg, type: "error" });
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setCsvUploading(false);
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = "";
        setSelectedCsvFile(null);
      }
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await requestConfirm({
      title: "Delete account",
      message:
        "Are you sure you want to delete your account data and revoke access? This action can be undone by reauthorizing the app.",
      confirmLabel: "Delete account",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/delete-account", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "Account deletion requested.",
          type: "success",
        });
        setTimeout(() => router.push("/"), 2000);
      } else {
        setShowToast({
          message: data.message || "Failed to delete account.",
          type: "error",
        });
      }
    } catch (err) {
      console.error(err);
      setShowToast({
        message: "Could not reach the server.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Statistics calculation moved to Statistics component

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Header - Extracted to components/dashboard/Header.tsx */}
        <Header
          user={user}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          showDebugPanel={showDebugPanel}
          setShowDebugPanel={setShowDebugPanel}
          availableChannels={availableChannels}
          selectedChannel={selectedChannel}
          handleChannelChange={handleChannelChange}
          handleDeleteAccount={handleDeleteAccount}
        />

        <ConfirmModal
          open={confirmModal.open}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          variant={confirmModal.variant}
          onConfirm={() => closeConfirmModal(true)}
          onCancel={() => closeConfirmModal(false)}
        />

        {/* Toast Notification */}
        {showToast && (
          <Toast
            message={showToast.message}
            type={showToast.type}
            onClose={() => setShowToast(null)}
            duration={showToast.type === "info" ? 8000 : 5000}
          />
        )}

        {/* Duplicate titles modal (when "Check for duplicates" found matches) */}
        {duplicateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  Some titles already uploaded
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {duplicateModal.duplicateTitles.length} of your items match titles in your uploaded list (by name). You can add them anyway or add only the new ones.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Matching is by title (case-insensitive) against your local uploaded list, not the YouTube API.
                </p>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  {duplicateModal.duplicateTitles.slice(0, 15).map((t, i) => (
                    <li key={i} className="truncate" title={t}>
                      • {t}
                    </li>
                  ))}
                  {duplicateModal.duplicateTitles.length > 15 && (
                    <li className="text-gray-500">
                      … and {duplicateModal.duplicateTitles.length - 15} more
                    </li>
                  )}
                </ul>
              </div>
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="px-4 py-2 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dupSet = new Set(
                      duplicateModal.duplicateTitles.map((t) => t.toLowerCase().trim()),
                    );
                    const filtered = duplicateModal.pendingFiles.filter(
                      (f) => !dupSet.has(f.name.toLowerCase().trim()),
                    );
                    doBulkSubmit(filtered, duplicateModal.pendingUrls);
                    setDuplicateModal(null);
                  }}
                  className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Add only new
                </button>
                <button
                  type="button"
                  onClick={() => {
                    doBulkSubmit(duplicateModal.pendingFiles, duplicateModal.pendingUrls);
                    setDuplicateModal(null);
                  }}
                  className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Add all anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard shortcuts (Debug only in development) */}
        <div className="mb-4 py-1.5 px-3 rounded-lg text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          {process.env.NODE_ENV === "development" && (
            <>
              <kbd className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
                Ctrl+K
              </kbd>{" "}
              Debug ·{" "}
            </>
          )}
          <kbd className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
            Ctrl+E
          </kbd>{" "}
          Export ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
            Esc
          </kbd>{" "}
          Close details
        </div>

        {/* Debug Panel (development only) */}
        {process.env.NODE_ENV === "development" && showDebugPanel && (
          <div className="mb-6 card bg-gray-900 dark:bg-gray-950 border-2 border-purple-500">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                <span>🐛</span>
                <span>Debug Logs</span>
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setDebugLogs([])}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowDebugPanel(false)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="bg-black rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-xs">
              {debugLogs.length === 0 ? (
                <div className="text-gray-500">
                  No debug logs yet. Logs will appear as the system updates.
                </div>
              ) : (
                debugLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`mb-1 ${
                      log.type === "success"
                        ? "text-green-400"
                        : log.type === "error"
                          ? "text-red-400"
                          : "text-gray-300"
                    }`}
                  >
                    <span className="text-gray-500">[{log.time}]</span>{" "}
                    <span>{log.message}</span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 text-xs text-gray-400">
              Polling: Adaptive (1s when jobs active, 3s idle) | Queue updates
              logged | Job progress tracked
            </div>
          </div>
        )}

        {/* Info Message (for copying progress) */}
        {message.type === "info" && (
          <div className="mb-5 p-4 rounded-lg font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700 flex items-center gap-3">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-800 dark:border-blue-200"></div>
            <span>{message.text}</span>
          </div>
        )}

        {/* Success Message (for CSV upload success) */}
        {message.type === "success" && (
          <div className="mb-5 p-4 rounded-lg font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700 flex items-center gap-3">
            <div className="text-xl">✅</div>
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabbed Interface */}
        <Tabs
          tabs={[
            {
              id: "upload",
              label: "Upload Videos",
              icon: "📤",
            },
            {
              id: "queue",
              label: "Queue & Progress",
              icon: "📊",
              badge: queue.filter(
                (j) => j.status === "processing" || j.status === "pending",
              ).length,
            },
            {
              id: "statistics",
              label: "Statistics",
              icon: "📈",
            },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === "upload" && (
            <div className="space-y-6">
              {/* Upload Summary - Quick overview */}
              <UploadSummary
                queue={queue}
                nextUploadTime={nextUploadTime}
                timeUntilNext={timeUntilNext}
              />

              {/* Upload Forms - Extracted to UploadForms component */}
              <UploadForms
                showSingleUpload={showSingleUpload}
                toggleSingleUpload={toggleSingleUpload}
                handleSingleUpload={handleSingleUpload}
                selectedVideoFile={selectedVideoFile}
                setSelectedVideoFile={setSelectedVideoFile}
                fileInputRef={fileInputRef}
                uploading={uploading}
                showBatchUpload={showBatchUpload}
                toggleBatchUpload={toggleBatchUpload}
                showBatchInstructions={showBatchInstructions}
                toggleBatchInstructions={toggleBatchInstructions}
                handleCsvUpload={handleCsvUpload}
                selectedCsvFile={selectedCsvFile}
                setSelectedCsvFile={setSelectedCsvFile}
                csvFileInputRef={csvFileInputRef}
                csvUploading={csvUploading}
                validateCsv={validateCsv}
                csvValidationErrors={csvValidationErrors}
                setCsvValidationErrors={setCsvValidationErrors}
                uploadProgress={uploadProgress}
                showBulkUpload={showBulkUpload}
                setShowBulkUpload={setShowBulkUpload}
                handleBulkUpload={handleBulkUpload}
                selectedBulkFiles={selectedBulkFiles}
                setSelectedBulkFiles={setSelectedBulkFiles}
                bulkFilesInputRef={bulkFilesInputRef}
                bulkUploading={bulkUploading}
                bulkUploadProgress={bulkUploadProgress}
                bulkUrls={bulkUrls}
                setBulkUrls={setBulkUrls}
                urlAuthHeaders={urlAuthHeaders}
                setUrlAuthHeaders={setUrlAuthHeaders}
                urlTimeout={urlTimeout}
                setUrlTimeout={setUrlTimeout}
                checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
                setCheckDuplicatesBeforeUpload={setCheckDuplicatesBeforeUpload}
                setShowToast={setShowToast}
                setSelectedJobId={setSelectedJobId}
                fetchJobStatus={fetchJobStatus}
                fetchQueue={fetchQueue}
              />
            </div>
          )}

          {activeTab === "queue" && (
            <div className="space-y-6">
              {/* Quick Stats Banner */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="text-sm opacity-90 mb-1">Total Jobs</div>
                  <div className="text-3xl font-bold">{queue.length}</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="text-sm opacity-90 mb-1">Processing</div>
                  <div className="text-3xl font-bold">
                    {
                      queue.filter(
                        (j) =>
                          j.status === "processing" || j.status === "pending",
                      ).length
                    }
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="text-sm opacity-90 mb-1">Completed</div>
                  <div className="text-3xl font-bold">
                    {queue.filter((j) => j.status === "completed").length}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="text-sm opacity-90 mb-1">Failed</div>
                  <div className="text-3xl font-bold">
                    {queue.filter((j) => j.status === "failed").length}
                  </div>
                </div>
              </div>

              {/* Queue Management - Extracted to QueueManagement component */}
              <QueueManagement
                queue={queue}
                searchQuery={searchQuery}
                selectedJobId={selectedJobId}
                setSelectedJobId={setSelectedJobId}
                fetchJobStatus={fetchJobStatus}
                fetchQueue={fetchQueue}
                handleQueueAction={handleQueueAction}
                jobStatus={jobStatus}
                jobFiles={jobFiles}
                loadingFiles={loadingFiles}
                handleDeleteFile={handleDeleteFile}
                handleDeleteAllFiles={handleDeleteAllFiles}
                setShowToast={setShowToast}
                requestConfirm={requestConfirm}
                onGoToUpload={() => setActiveTab("upload")}
              />
            </div>
          )}

          {activeTab === "statistics" && (
            <div className="space-y-6">
              <Statistics
                queue={queue}
                nextUploadTime={nextUploadTime}
                timeUntilNext={timeUntilNext}
                isActive={activeTab === "statistics"}
                requestConfirm={requestConfirm}
                setShowToast={(t) => setShowToast(t)}
              />
            </div>
          )}
        </Tabs>

        <footer className="text-center py-5 text-gray-500">
          &copy; 2025 ZonDiscounts.{" "}
          <Link href="/privacy" className="text-red-600 hover:underline">
            Privacy
          </Link>{" "}
          •{" "}
          <Link href="/terms" className="text-red-600 hover:underline">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
