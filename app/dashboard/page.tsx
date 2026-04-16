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
import { useAppToast } from "@/app/app-toast-context";
import ConfirmModal from "@/app/components/ConfirmModal";
import Header from "@/app/components/dashboard/Header";
import DashboardErrorBoundary from "@/app/components/dashboard/DashboardErrorBoundary";
import DashboardTabs from "@/app/components/dashboard/DashboardTabs";
import DuplicateTitlesDialog from "@/app/components/dashboard/DuplicateTitlesDialog";
import { DropboxAuthProvider } from "@/app/components/dashboard/DropboxAuthContext";
import Statistics from "@/app/components/dashboard/Statistics";
import UploadForms from "@/app/components/dashboard/UploadForms";
import QueueManagement from "@/app/components/dashboard/QueueManagement";
import UploadSummary from "@/app/components/dashboard/UploadSummary";
import QueueModeStrip from "@/app/components/dashboard/QueueModeStrip";
import UploadScheduleSettings from "@/app/components/dashboard/UploadScheduleSettings";
import AiAssistSettings from "@/app/components/dashboard/AiAssistSettings";
import DescriptionTemplateSettings from "@/app/components/dashboard/DescriptionTemplateSettings";
import CommandPalette from "@/app/components/dashboard/CommandPalette";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import {
  readUploadScheduleFromStorage,
  writeUploadScheduleToStorage,
} from "@/lib/global-upload-schedule";
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
  const [uploadScheduleHydrated, setUploadScheduleHydrated] =
    useState<boolean>(false);
  const [uploadScheduleEnabled, setUploadScheduleEnabled] =
    useState<boolean>(false);
  const [uploadScheduleVpd, setUploadScheduleVpd] = useState<string>("");
  const [scheduleJustSaved, setScheduleJustSaved] = useState(false);
  const scheduleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scheduleSavedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const showAppToast = useAppToast();
  const bulkFilesInputRef = useRef<HTMLInputElement>(null);

  const { confirmModal, requestConfirm, closeConfirmModal } = useConfirmModal();
  const queueState = useQueue({
    requestConfirm,
  });
  const {
    queue,
    setQueue,
    workerBusy,
    workerHeartbeat,
    pythonQueue,
    selectedJobId,
    setSelectedJobId,
    jobStatus,
    searchQuery,
    setSearchQuery,
    nextUploadTime,
    timeUntilNext,
    fetchQueue,
    fetchJobStatus,
    handleQueueAction,
  } = queueState;
  const bulkUpload = useBulkUpload({
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

  const exportStatistics = useCallback(async (format: "json" | "csv") => {
    try {
      const res = await fetch(`/api/export-stats?format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `youtube-uploader-stats-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showAppToast({
        message: `Exported statistics (${format.toUpperCase()})`,
        type: "success",
      });
    } catch {
      showAppToast({ message: "Could not export statistics", type: "error" });
    }
  }, [showAppToast]);

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
  const [showBulkUpload, setShowBulkUpload] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [dropboxQueuePickerNonce, setDropboxQueuePickerNonce] = useState(0);
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
        } else if (row.youtube_title.length > 100) {
          errors.push(
            `Row ${i + 1}: youtube_title too long (${row.youtube_title.length} chars, max 100)`,
          );
        }
        if (!row.youtube_description || !row.youtube_description.trim()) {
          errors.push(`Row ${i + 1}: Missing youtube_description`);
        } else if (row.youtube_description.length > 5000) {
          errors.push(
            `Row ${i + 1}: youtube_description too long (${row.youtube_description.length} chars, max 5000)`,
          );
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

  // Keyboard shortcuts (Ctrl+Shift+K debug in development; Ctrl+K is command palette)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (
        process.env.NODE_ENV === "development" &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        void exportStatistics("json");
      }
      // Escape: Close job details
      if (e.key === "Escape" && selectedJobId) {
        setSelectedJobId(null);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedJobId, exportStatistics]);

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
    const saved = localStorage.getItem(DASHBOARD_STORAGE.darkMode);
    if (saved === "true") {
      setDarkMode(true);
    }
  }, []);

  // Load single upload section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(DASHBOARD_STORAGE.showSingleUpload);
    if (saved !== null) {
      setShowSingleUpload(saved === "true");
    }
  }, []);

  // Real-time polling: Refresh all uploaded files automatically while uploads are active

  // Load Upload Videos (bulk) section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(DASHBOARD_STORAGE.showBulkUpload);
    if (saved !== null) {
      setShowBulkUpload(saved === "true");
    }
  }, []);

  // Persist Upload Videos collapse state when it changes
  useEffect(() => {
    localStorage.setItem(
      DASHBOARD_STORAGE.showBulkUpload,
      String(showBulkUpload),
    );
  }, [showBulkUpload]);

  // Load "check duplicates before upload" preference
  useEffect(() => {
    const saved = localStorage.getItem(
      DASHBOARD_STORAGE.checkDuplicatesBeforeUpload,
    );
    if (saved !== null) {
      setCheckDuplicatesBeforeUpload(saved === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      DASHBOARD_STORAGE.checkDuplicatesBeforeUpload,
      String(checkDuplicatesBeforeUpload),
    );
  }, [checkDuplicatesBeforeUpload]);

  // Global upload schedule (videos/day): load once, then auto-save to localStorage
  useEffect(() => {
    const r = readUploadScheduleFromStorage();
    setUploadScheduleEnabled(r.enabled);
    setUploadScheduleVpd(r.videosPerDay);
    setUploadScheduleHydrated(true);
  }, []);

  useEffect(() => {
    if (!uploadScheduleHydrated) return;
    if (scheduleSaveTimerRef.current) {
      clearTimeout(scheduleSaveTimerRef.current);
    }
    scheduleSaveTimerRef.current = setTimeout(() => {
      writeUploadScheduleToStorage(uploadScheduleEnabled, uploadScheduleVpd);
      setScheduleJustSaved(true);
      if (scheduleSavedFlashRef.current) {
        clearTimeout(scheduleSavedFlashRef.current);
      }
      scheduleSavedFlashRef.current = setTimeout(
        () => setScheduleJustSaved(false),
        2000,
      );
    }, 400);
    return () => {
      if (scheduleSaveTimerRef.current) {
        clearTimeout(scheduleSaveTimerRef.current);
      }
    };
  }, [uploadScheduleHydrated, uploadScheduleEnabled, uploadScheduleVpd]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem(DASHBOARD_STORAGE.darkMode, String(newMode));
  };

  const toggleSingleUpload = () => {
    const newState = !showSingleUpload;
    setShowSingleUpload(newState);
    localStorage.setItem(
      DASHBOARD_STORAGE.showSingleUpload,
      String(newState),
    );
  };

  useEffect(() => {
    fetchUser();
    fetchAvailableChannels();
  }, []);

  const fetchAvailableChannels = async () => {
    try {
      const res = await fetch("/api/channels", { credentials: "include" });
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
      const res = await fetch("/api/user", { credentials: "include" });
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
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        showAppToast({
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
        showAppToast({ message: errorMsg, type: "error" });
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
      showAppToast({ message: errorMsg, type: "error" });
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
        credentials: "include",
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

                  showAppToast({
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
      showAppToast({ message: errorMsg, type: "error" });
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
      const res = await fetch("/api/delete-account", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        showAppToast({
          message: data.message || "Account deletion requested.",
          type: "success",
        });
        setTimeout(() => router.push("/"), 2000);
      } else {
        showAppToast({
          message: data.message || "Failed to delete account.",
          type: "error",
        });
      }
    } catch (err) {
      console.error(err);
      showAppToast({
        message: "Could not reach the server.",
        type: "error",
      });
    }
  };

  const queueTabBadge =
    queue.filter((j) => j.status === "processing" || j.status === "pending")
      .length + (pythonQueue?.pending?.length ?? 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Statistics calculation moved to Statistics component

  return (
    <DropboxAuthProvider onToast={showAppToast}>
      <div className="min-h-screen bg-background">
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

        <CommandPalette
          onGoUpload={() => setActiveTab("upload")}
          onGoQueue={() => setActiveTab("queue")}
          onGoStatistics={() => setActiveTab("statistics")}
          onExportStatsJson={() => exportStatistics("json")}
          onExportStatsCsv={() => exportStatistics("csv")}
          onToggleDebug={
            process.env.NODE_ENV === "development"
              ? () => setShowDebugPanel((p) => !p)
              : undefined
          }
        />

        <DuplicateTitlesDialog
          duplicateModal={duplicateModal}
          onDismiss={() => setDuplicateModal(null)}
          onAddOnlyNew={() => {
            if (!duplicateModal) return;
            const dupSet = new Set(
              duplicateModal.duplicateTitles.map((t) => t.toLowerCase().trim()),
            );
            const filtered = duplicateModal.pendingFiles.filter(
              (f) => !dupSet.has(f.name.toLowerCase().trim()),
            );
            void doBulkSubmit(filtered, duplicateModal.pendingUrls);
            setDuplicateModal(null);
          }}
          onAddAllAnyway={() => {
            if (!duplicateModal) return;
            void doBulkSubmit(
              duplicateModal.pendingFiles,
              duplicateModal.pendingUrls,
            );
            setDuplicateModal(null);
          }}
        />

        {/* Keyboard shortcuts (Debug only in development) */}
        <div className="mb-4 py-1.5 px-3 rounded-lg text-xs text-muted-foreground bg-muted/50 border border-border">
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono">
            Ctrl+K
          </kbd>{" "}
          Command palette ·{" "}
          {process.env.NODE_ENV === "development" && (
            <>
              <kbd className="px-1 py-0.5 rounded bg-muted font-mono">
                Ctrl+Shift+K
              </kbd>{" "}
              Debug ·{" "}
            </>
          )}
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono">
            Ctrl+E
          </kbd>{" "}
          Export ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono">
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

        <DashboardErrorBoundary>
        <DashboardTabs
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          queueTabBadge={queueTabBadge}
          uploadContent={
            <>
              <QueueModeStrip
                fetchQueue={fetchQueue}
                onOpenQueueTab={() => setActiveTab("queue")}
                onRequestManualDropboxQueue={() => {
                  setActiveTab("upload");
                  setShowBulkUpload(true);
                  setDropboxQueuePickerNonce((n) => n + 1);
                }}
              />
              <UploadScheduleSettings
                enabled={uploadScheduleEnabled}
                videosPerDay={uploadScheduleVpd}
                onEnabledChange={setUploadScheduleEnabled}
                onVideosPerDayChange={setUploadScheduleVpd}
                hydrated={uploadScheduleHydrated}
                justSaved={scheduleJustSaved}
              />
              <AiAssistSettings />
              <DescriptionTemplateSettings />
              <UploadSummary
                queue={queue}
                nextUploadTime={nextUploadTime}
                timeUntilNext={timeUntilNext}
              />
              <UploadForms
                showSingleUpload={showSingleUpload}
                toggleSingleUpload={toggleSingleUpload}
                handleSingleUpload={handleSingleUpload}
                selectedVideoFile={selectedVideoFile}
                setSelectedVideoFile={setSelectedVideoFile}
                fileInputRef={fileInputRef}
                uploading={uploading}
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
                setSelectedJobId={setSelectedJobId}
                fetchJobStatus={fetchJobStatus}
                fetchQueue={fetchQueue}
                schedulingEnabled={uploadScheduleEnabled}
                globalVideosPerDay={uploadScheduleVpd}
                openDropboxQueuePickerNonce={dropboxQueuePickerNonce}
              />
            </>
          }
          queueContent={
            <>
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
              <QueueManagement
                queue={queue}
                workerBusy={workerBusy}
                workerHeartbeat={workerHeartbeat}
                pythonQueue={pythonQueue}
                searchQuery={searchQuery}
                selectedJobId={selectedJobId}
                setSelectedJobId={setSelectedJobId}
                fetchJobStatus={fetchJobStatus}
                fetchQueue={fetchQueue}
                handleQueueAction={handleQueueAction}
                jobStatus={jobStatus}
                requestConfirm={requestConfirm}
                onGoToUpload={() => setActiveTab("upload")}
              />
            </>
          }
          statisticsContent={
            <Statistics
              queue={queue}
              nextUploadTime={nextUploadTime}
              timeUntilNext={timeUntilNext}
              isActive={activeTab === "statistics"}
              requestConfirm={requestConfirm}
            />
          }
        />
        </DashboardErrorBoundary>

        <footer className="text-center py-5 text-gray-500">
          &copy; {new Date().getFullYear()} ZonDiscounts.{" "}
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
    </DropboxAuthProvider>
  );
}
