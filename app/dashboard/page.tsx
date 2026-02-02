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
import Header from "@/app/components/dashboard/Header";
import Statistics from "@/app/components/dashboard/Statistics";
import UploadForms from "@/app/components/dashboard/UploadForms";
import QueueManagement from "@/app/components/dashboard/QueueManagement";
import UploadSummary from "@/app/components/dashboard/UploadSummary";
import Tabs from "@/app/components/dashboard/Tabs";
import type { User } from "@/app/components/dashboard/types";

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
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [showToast, setShowToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [nextUploadTime, setNextUploadTime] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState<string>("");
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
  const [jobFiles, setJobFiles] = useState<any>(null);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [showSingleUpload, setShowSingleUpload] = useState<boolean>(false); // Collapsed by default
  const [showBatchUpload, setShowBatchUpload] = useState<boolean>(true); // Expanded by default
  const [showBulkUpload, setShowBulkUpload] = useState<boolean>(false);
  const [bulkUploading, setBulkUploading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    total: number;
    totalBatches: number;
    currentBatch: number;
    completed: number;
    failed: number;
    currentFile?: string;
    message?: string;
  } | null>(null);
  const [selectedBulkFiles, setSelectedBulkFiles] = useState<File[]>([]);
  const [bulkUrls, setBulkUrls] = useState<string[]>([]);
  const [urlAuthHeaders, setUrlAuthHeaders] = useState<string>("");
  const [urlTimeout, setUrlTimeout] = useState<string>("");
  const bulkFilesInputRef = useRef<HTMLInputElement>(null);
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

  // Calculate next scheduled upload batch time (when next batch of videos will start uploading)
  const calculateNextUploadTime = useCallback(() => {
    const now = new Date();
    let earliestDate: Date | null = null;

    // Check all scheduled jobs
    for (const job of queue) {
      if (
        job.videosPerDay &&
        job.videosPerDay > 0 &&
        job.status !== "failed" &&
        job.status !== "completed" &&
        job.status !== "cancelled"
      ) {
        // Use startDate from job if provided, otherwise use today
        const startDate = job.startDate ? new Date(job.startDate) : new Date();
        startDate.setHours(12, 0, 0, 0); // Set to noon for consistency

        // Count how many videos have been completed
        const completedCount =
          job.progress?.filter(
            (p: ProgressItem) =>
              p &&
              p.status &&
              (p.status.includes("Uploaded") ||
                p.status.includes("scheduled") ||
                p.status.includes("Scheduled")),
          ).length || 0;

        const totalVideos = job.items?.length || job.totalVideos || 0;

        // If there are still videos to upload
        if (completedCount < totalVideos) {
          // Calculate which day we're on (0-indexed)
          // dayIndex = Math.floor(videoIndex / videosPerDay)
          const currentDayIndex = Math.floor(completedCount / job.videosPerDay);

          // Calculate when the next batch should start uploading
          // Next batch is on startDate + (currentDayIndex + 1) days at noon
          const nextBatchStartTime = new Date(startDate);
          nextBatchStartTime.setDate(startDate.getDate() + currentDayIndex + 1);
          nextBatchStartTime.setHours(12, 0, 0, 0);

          // Only consider future times
          if (nextBatchStartTime > now) {
            if (!earliestDate || nextBatchStartTime < earliestDate) {
              earliestDate = nextBatchStartTime;
            }
          } else {
            // If the next batch time is in the past, it means we should upload now
            // Set to now + a small buffer to show "uploading now"
            if (!earliestDate || now < earliestDate) {
              earliestDate = new Date(now.getTime() + 1000); // 1 second from now
            }
          }
        }
      }
    }

    setNextUploadTime(earliestDate);
  }, [queue]);

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      if (!nextUploadTime) {
        setTimeUntilNext("");
        return;
      }

      const now = new Date();
      const diff = nextUploadTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilNext("Uploading now...");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeUntilNext(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeUntilNext(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeUntilNext(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilNext(`${seconds}s`);
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [nextUploadTime]);

  // Recalculate next upload time when queue changes
  useEffect(() => {
    calculateNextUploadTime();
  }, [calculateNextUploadTime]);

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

  const handleQueueAction = async (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "delete" | "delete-all-jobs",
  ) => {
    try {
      // For delete-all-jobs, don't send jobId
      const body =
        action === "delete-all-jobs"
          ? JSON.stringify({ action })
          : JSON.stringify({ jobId, action });

      const res = await fetch("/api/queue-manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (res.ok) {
        setShowToast({ message: data.message, type: "success" });
        // Immediately refresh to show updated status
        fetchQueue();
        // If deleting, clear selected job if it was the deleted one
        if (action === "delete" && selectedJobId === jobId) {
          setSelectedJobId(null);
          setJobStatus(null);
        } else if (selectedJobId === jobId) {
          fetchJobStatus(jobId);
          // Also refresh after a short delay to catch any state changes
          setTimeout(() => {
            fetchQueue();
            if (selectedJobId === jobId) {
              fetchJobStatus(jobId);
            }
          }, 500);
        }
      } else {
        setShowToast({
          message: data.error || "Failed to perform action",
          type: "error",
        });
      }
    } catch (error) {
      setShowToast({ message: "An error occurred", type: "error" });
    }
  };

  // Adaptive polling: 1s when jobs are processing/pending, 3s when idle
  const hasActiveJobs = queue.some(
    (j) => j.status === "processing" || j.status === "pending",
  );
  const pollIntervalMs = hasActiveJobs ? 1000 : 3000;

  useEffect(() => {
    fetchUser();
    fetchAvailableChannels();
    fetchQueue();

    const pollInterval = setInterval(() => {
      fetchQueue();
      if (selectedJobId) {
        fetchJobStatus(selectedJobId);
      }
    }, pollIntervalMs);

    return () => clearInterval(pollInterval);
  }, [selectedJobId, pollIntervalMs]);

  // Immediate fetch when selectedJobId changes
  useEffect(() => {
    if (selectedJobId) {
      fetchJobStatus(selectedJobId);
      fetchQueue(); // Also refresh queue
      fetchJobFiles(selectedJobId); // Fetch uploaded files
    }
  }, [selectedJobId]);

  const fetchJobFiles = async (jobId: string) => {
    try {
      setLoadingFiles(true);
      const res = await fetch(`/api/delete-videos?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setJobFiles(data);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching job files:", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleDeleteFile = async (
    jobId: string,
    filePath: string,
    fileName: string,
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/delete-videos?jobId=${jobId}&filePath=${encodeURIComponent(
          filePath,
        )}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "File deleted successfully",
          type: "success",
        });
        fetchJobFiles(jobId); // Refresh file list
      } else {
        setShowToast({
          message: data.error || "Failed to delete file",
          type: "error",
        });
      }
    } catch (error) {
      setShowToast({
        message: "An error occurred while deleting the file",
        type: "error",
      });
    }
  };

  const handleDeleteAllFiles = async (jobId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete ALL uploaded files for this job? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/delete-videos?jobId=${jobId}&deleteAll=true`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "All files deleted successfully",
          type: "success",
        });
        fetchJobFiles(jobId); // Refresh file list
      } else {
        setShowToast({
          message: data.error || "Failed to delete files",
          type: "error",
        });
      }
    } catch (error) {
      setShowToast({
        message: "An error occurred while deleting files",
        type: "error",
      });
    }
  };

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

  const fetchQueue = async () => {
    try {
      const timestamp = Date.now();
      // Add cache-busting to ensure fresh data
      const res = await fetch(`/api/upload-queue?t=${timestamp}`);
      const data = await res.json();
      if (res.ok && data.queue) {
        const prevQueueLength = queue.length;
        const prevProcessingCount = queue.filter(
          (j) => j.status === "processing",
        ).length;
        setQueue(data.queue);

        // Debug logging
        const newQueueLength = data.queue.length;
        const newProcessingCount = data.queue.filter(
          (j: any) => j.status === "processing",
        ).length;

        // Only log when there are actual changes (not just polling)
        if (
          newQueueLength !== prevQueueLength ||
          newProcessingCount !== prevProcessingCount
        ) {
          const logMsg = `Queue updated: ${prevQueueLength}→${newQueueLength} jobs, ${prevProcessingCount}→${newProcessingCount} processing`;
          console.log(`[DEBUG] ${logMsg}`);
          addDebugLog(logMsg, "info");
        }

        // Check for stuck pending jobs (only log once per job to avoid spam)
        const pendingJobs = data.queue.filter(
          (j: any) => j.status === "pending",
        );
        if (pendingJobs.length > 0) {
          pendingJobs.forEach((job: any) => {
            const ageSeconds =
              (Date.now() - new Date(job.createdAt).getTime()) / 1000;
            // Log warning if stuck for more than 15 seconds, but only every 10 seconds to avoid spam
            // Removed worker check - no longer needed
          });
        }
      }
    } catch (error) {
      console.error("[ERROR] Error fetching queue:", error);
    }
  };

  const fetchJobStatus = async (jobId: string) => {
    try {
      const timestamp = Date.now();
      // Determine if this is a bulk job (starts with "bulk-") or regular queue job
      const isBulkJob = jobId.startsWith("bulk-");
      const endpoint = isBulkJob ? "/api/bulk-status" : "/api/queue-status";

      // Add cache-busting to ensure fresh data
      const res = await fetch(`${endpoint}?jobId=${jobId}&t=${timestamp}`);
      const data = await res.json();

      if (res.ok) {
        // Handle both bulk-status and queue-status response formats
        const job = data.job || data; // queue-status returns {job: {...}}, bulk-status returns {...}
        const jobData = job || data;

        if (jobData) {
          const prevStatus = jobStatus?.status;
          const prevProgressCount = jobStatus?.progress?.length || 0;
          const prevCompletedCount =
            jobStatus?.progress?.filter(
              (p: ProgressItem) =>
                p &&
                p.status &&
                (p.status.includes("Uploaded") ||
                  p.status.includes("Scheduled")),
            ).length || 0;

          // Normalize bulk job data to match queue job format
          const normalizedJob = isBulkJob
            ? {
                id: jobData.jobId || jobData.id,
                status: jobData.status,
                progress: jobData.progress || [],
                totalVideos:
                  jobData.totalItems || jobData.progress?.length || 0,
                items: jobData.items || [], // Include items for title display
                videosPerDay: jobData.videosPerDay,
                startDate: jobData.startDate,
                createdAt: jobData.createdAt,
                updatedAt: jobData.updatedAt,
                error: jobData.error,
              }
            : jobData;

          setJobStatus(normalizedJob);

          // Debug logging for progress changes
          const newProgressCount = normalizedJob.progress?.length || 0;
          const newCompletedCount =
            normalizedJob.progress?.filter(
              (p: ProgressItem) =>
                p &&
                p.status &&
                (p.status.includes("Uploaded") ||
                  p.status.includes("Scheduled") ||
                  p.status.includes("scheduled")),
            ).length || 0;

          // Only log meaningful changes
          if (
            normalizedJob.status !== prevStatus ||
            newProgressCount !== prevProgressCount ||
            newCompletedCount !== prevCompletedCount
          ) {
            const statusChange =
              prevStatus && prevStatus !== normalizedJob.status
                ? `Status: ${prevStatus}→${normalizedJob.status}`
                : "";
            const progressChange =
              newCompletedCount !== prevCompletedCount
                ? `Completed: ${prevCompletedCount}→${newCompletedCount}`
                : "";
            const logMsg = `Job ${jobId.substring(
              0,
              20,
            )}... ${statusChange} ${progressChange}`.trim();
            if (logMsg.length > 20) {
              // Only log if there's actual content
              console.log(`[DEBUG] ${logMsg}`);
              addDebugLog(
                logMsg,
                newCompletedCount > prevCompletedCount
                  ? "success"
                  : normalizedJob.status === "processing"
                    ? "info"
                    : "info",
              );
            }
          }
        }
      } else {
        // If job not found, clear the status
        if (res.status === 404) {
          console.log(`[DEBUG] Job ${jobId} not found, clearing status`);
          setJobStatus(null);
        }
      }
    } catch (error) {
      console.error("[ERROR] Error fetching job status:", error);
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

  const handleBulkUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBulkUploading(true);
    setBulkUploadProgress(null);
    setMessage({ type: null, text: null });

    if (selectedBulkFiles.length === 0 && bulkUrls.length === 0) {
      setShowToast({
        message: "Please select video files or enter URLs to upload.",
        type: "error",
      });
      setBulkUploading(false);
      return;
    }

    const formData = new FormData();

    // Add files
    selectedBulkFiles.forEach((file) => {
      formData.append("files", file);
    });

    // Add URLs
    bulkUrls.forEach((url) => {
      if (url.trim()) {
        formData.append("urls", url.trim());
      }
    });

    // Add auth headers if provided
    if (urlAuthHeaders.trim()) {
      formData.append("urlAuthHeaders", urlAuthHeaders.trim());
    }

    // Add timeout if provided
    if (urlTimeout.trim()) {
      formData.append("urlTimeout", urlTimeout.trim());
    }

    // Use worker by default
    formData.append("useWorker", "true");

    try {
      const res = await fetch("/api/upload-bulk", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Bulk upload failed" }));
        throw new Error(errorData.error || "Bulk upload failed");
      }

      // Check if job was queued (202 status)
      if (res.status === 202) {
        const data = await res.json();
        setShowToast({
          message: `✅ Upload queued! Job ID: ${data.jobId}. Processing ${data.totalItems} items in background.`,
          type: "success",
        });
        setMessage({
          type: "success",
          text: `Upload queued: ${data.totalItems} items. Check status below.`,
        });
        setBulkUploading(false);
        // Reset form
        setSelectedBulkFiles([]);
        setBulkUrls([]);
        setUrlAuthHeaders("");
        setUrlTimeout("");
        if (bulkFilesInputRef.current) {
          bulkFilesInputRef.current.value = "";
        }
        return;
      }

      if (!res.body) {
        throw new Error("No response body for bulk upload");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let totalCompleted = 0;
      let totalFailed = 0;

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
                  setBulkUploadProgress({
                    total: data.total,
                    totalBatches: data.totalBatches,
                    currentBatch: 0,
                    completed: 0,
                    failed: 0,
                    message: `Starting bulk upload: ${data.total} videos in ${data.totalBatches} batches`,
                  });
                  break;

                case "batch_start":
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    currentBatch: data.batchNumber,
                    totalBatches: data.totalBatches,
                    message: `Processing batch ${data.batchNumber}/${data.totalBatches}`,
                  }));
                  break;

                case "upload_start":
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    currentFile: data.filename,
                    message: `Uploading: ${data.filename}`,
                  }));
                  break;

                case "upload_success":
                  totalCompleted++;
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    completed: totalCompleted,
                    message: `✅ ${data.filename} uploaded (${totalCompleted}/${prev!.total})`,
                  }));
                  break;

                case "upload_failed":
                  totalFailed++;
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    failed: totalFailed,
                    message: `❌ ${data.filename} failed: ${data.error}`,
                  }));
                  break;

                case "batch_complete":
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    completed: data.completed,
                    failed: data.failed,
                    message: `Batch ${data.batchNumber}/${data.totalBatches} complete: ${data.completed} succeeded, ${data.failed} failed`,
                  }));
                  break;

                case "progress":
                  setBulkUploadProgress((prev) => ({
                    ...prev!,
                    completed: data.totalCompleted,
                    failed: data.totalFailed,
                    total: data.total || prev?.total || 0,
                    message: `Progress: ${data.totalCompleted} succeeded, ${data.totalFailed} failed`,
                  }));
                  break;

                case "complete":
                  totalCompleted = data.totalCompleted;
                  totalFailed = data.totalFailed;
                  let finalMessage = `✅ Bulk Upload Complete!\n\n`;
                  finalMessage += `📊 ${totalCompleted} videos uploaded successfully`;
                  if (totalFailed > 0) {
                    finalMessage += `\n⚠️ ${totalFailed} videos failed`;
                  }
                  setShowToast({
                    message: finalMessage.trim(),
                    type: totalFailed > 0 ? "info" : "success",
                  });
                  setMessage({
                    type: totalFailed > 0 ? "info" : "success",
                    text: `✅ Bulk upload complete: ${totalCompleted} succeeded${totalFailed > 0 ? `, ${totalFailed} failed` : ""}`,
                  });
                  break;

                case "error":
                  throw new Error(data.error);
              }
            } catch (parseError) {
              console.error(
                "Error parsing SSE data for bulk upload:",
                parseError,
                line,
              );
            }
          }
        }
      }

      // Reset form
      if (bulkFilesInputRef.current) {
        bulkFilesInputRef.current.value = "";
      }
      setSelectedBulkFiles([]);
    } catch (error: any) {
      console.error("=== BULK UPLOAD EXCEPTION (Client) ===");
      console.error("Error:", error);
      const errorMsg =
        error?.message || "An error occurred during bulk upload.";
      setShowToast({ message: errorMsg, type: "error" });
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setBulkUploading(false);
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
    if (
      !confirm(
        "Are you sure you want to delete your account data and revoke access? This action can be undone by reauthorizing the app.",
      )
    ) {
      return;
    }

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

        {/* Toast Notification */}
        {showToast && (
          <Toast
            message={showToast.message}
            type={showToast.type}
            onClose={() => setShowToast(null)}
            duration={showToast.type === "info" ? 8000 : 5000}
          />
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
              />
            </div>
          )}

          {activeTab === "statistics" && (
            <div className="space-y-6">
              <Statistics
                queue={queue}
                nextUploadTime={nextUploadTime}
                timeUntilNext={timeUntilNext}
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
