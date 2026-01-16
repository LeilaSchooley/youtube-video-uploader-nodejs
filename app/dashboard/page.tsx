"use client";

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

interface User {
  authenticated: boolean;
  name: string;
  picture: string;
}

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
  const [selectedVideoFiles, setSelectedVideoFiles] = useState<File[]>([]); // For CSV bulk upload
  const [selectedThumbnailFiles, setSelectedThumbnailFiles] = useState<File[]>(
    []
  ); // For CSV bulk upload thumbnails
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<
    Array<{ time: string; message: string; type: "info" | "success" | "error" }>
  >([]);
  const [migrationDirs, setMigrationDirs] = useState<Array<{
    name: string;
    hasStaging: boolean;
    jobCount: number;
    fileCount: number;
    isCurrentUser: boolean;
  }>>([]);
  const [migrationSource, setMigrationSource] = useState<string>("");
  const [migrationDest, setMigrationDest] = useState<string>("");
  const [migratingFiles, setMigratingFiles] = useState<boolean>(false);
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
  const [allFiles, setAllFiles] = useState<any>(null);
  const [loadingAllFiles, setLoadingAllFiles] = useState<boolean>(false);
  const [showAllFiles, setShowAllFiles] = useState<boolean>(true); // Expanded by default
  const [showSingleUpload, setShowSingleUpload] = useState<boolean>(true); // Expanded by default
  const [showBatchUpload, setShowBatchUpload] = useState<boolean>(true); // Expanded by default
  const [showBatchInstructions, setShowBatchInstructions] =
    useState<boolean>(false); // Collapsed by default
  const [showStaging, setShowStaging] = useState<boolean>(true); // Expanded by default
  const [stagingFiles, setStagingFiles] = useState<{
    videos: Array<{ name: string; size: number; sizeFormatted: string; uploadedAt: string }>;
    thumbnails: Array<{ name: string; size: number; sizeFormatted: string; uploadedAt: string }>;
    totals: {
      videoCount: number;
      thumbnailCount: number;
      totalVideoSize: number;
      totalVideoSizeFormatted: string;
      totalThumbnailSize: number;
      totalThumbnailSizeFormatted: string;
    };
  } | null>(null);
  const [loadingStaging, setLoadingStaging] = useState<boolean>(false);
  const [uploadingVideosToStaging, setUploadingVideosToStaging] = useState<boolean>(false);
  const [uploadingThumbnailsToStaging, setUploadingThumbnailsToStaging] = useState<boolean>(false);
  const [stagingVideoProgress, setStagingVideoProgress] = useState<{
    currentFile: number;
    totalFiles: number;
    currentFileName: string;
  } | null>(null);
  const [stagingThumbnailProgress, setStagingThumbnailProgress] = useState<{
    currentFile: number;
    totalFiles: number;
    currentFileName: string;
  } | null>(null);
  const [videoBatchSize, setVideoBatchSize] = useState<number>(10); // Default: 10 videos per batch
  const [expandedCategories, setExpandedCategories] = useState<{
    videos: boolean;
    thumbnails: boolean;
    csvs: boolean;
  }>({
    videos: true,
    thumbnails: true,
    csvs: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const videoFilesInputRef = useRef<HTMLInputElement>(null);
  const thumbnailFilesInputRef = useRef<HTMLInputElement>(null);
  const stagingVideoInputRef = useRef<HTMLInputElement>(null);
  const stagingThumbnailInputRef = useRef<HTMLInputElement>(null);

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
    []
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
        (req) => !headers.includes(req.toLowerCase())
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
        if (!row.path || !row.path.trim()) {
          errors.push(`Row ${i + 1}: Missing path`);
        }
      }
    } catch (error) {
      errors.push(
        `Error reading CSV: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
    return errors;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K: Toggle debug panel
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
      }
      // Ctrl/Cmd + E: Export stats
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        const exportBtn = document.querySelector(
          '[title="Export statistics as JSON"]'
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
        job.videosPerDay > 0 &&
        job.status !== "failed" &&
        job.status !== "completed" &&
        job.status !== "cancelled"
      ) {
        // Use job creation time as the start time for upload batches
        const jobStartTime = new Date(job.createdAt);

        // Count how many videos have been completed
        const completedCount =
          job.progress?.filter(
            (p: ProgressItem) =>
              p.status.includes("Uploaded") ||
              p.status.includes("scheduled") ||
              p.status.includes("Scheduled")
          ).length || 0;

        const totalVideos = job.totalVideos || job.progress?.length || 0;

        // If there are still videos to upload
        if (completedCount < totalVideos) {
          // Calculate which batch we're on (0-indexed)
          const currentBatch = Math.floor(completedCount / job.videosPerDay);

          // Calculate when the next batch should start uploading
          // Next batch starts 24 hours after the job was created, then every 24 hours after that
          const nextBatchStartTime = new Date(jobStartTime);
          nextBatchStartTime.setTime(
            jobStartTime.getTime() + (currentBatch + 1) * 24 * 60 * 60 * 1000
          );

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
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
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

  // Fetch all files on component load if expanded by default
  useEffect(() => {
    if (user?.authenticated && showAllFiles && !allFiles) {
      fetchAllFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authenticated, showAllFiles]);

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

  // Load staging section preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showStaging");
    if (saved !== null) {
      setShowStaging(saved === "true");
    }
  }, []);

  // Load video batch size preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("videoBatchSize");
    if (saved !== null) {
      const batchSize = parseInt(saved, 10);
      if (!isNaN(batchSize) && batchSize > 0 && batchSize <= 100) {
        setVideoBatchSize(batchSize);
      }
    }
  }, []);

  // Fetch staging files on component load if expanded by default
  useEffect(() => {
    if (user?.authenticated && showStaging) {
      fetchStagingFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authenticated, showStaging]);

  // Real-time polling: Refresh staging files and all uploaded files automatically while uploads are active
  useEffect(() => {
    if (!user?.authenticated) return;
    
    // Only poll if uploads are active
    if (!uploadingVideosToStaging && !uploadingThumbnailsToStaging) return;

    // Poll every 10 seconds while uploads are active
    const intervalId = setInterval(() => {
      // Refresh staging files if staging section is visible
      if (showStaging) {
        fetchStagingFiles();
      }
      // Refresh all uploaded files if that section is visible
      if (showAllFiles) {
        fetchAllFiles();
      }
    }, 10000);

    // Cleanup interval when uploads stop or component unmounts
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authenticated, showStaging, showAllFiles, uploadingVideosToStaging, uploadingThumbnailsToStaging]);

  // Load batch instructions preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("showBatchInstructions");
    if (saved !== null) {
      setShowBatchInstructions(saved === "true");
    }
  }, []);

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

  const toggleStaging = () => {
    const newState = !showStaging;
    setShowStaging(newState);
    localStorage.setItem("showStaging", String(newState));
  };

  const fetchStagingFiles = async () => {
    setLoadingStaging(true);
    try {
      const response = await fetch("/api/staging/list");
      const data = await response.json();
      if (data.success) {
        setStagingFiles(data);
      } else {
        setShowToast({ message: data.error || "Failed to load staging files", type: "error" });
      }
    } catch (error: any) {
      setShowToast({ message: error.message || "Failed to load staging files", type: "error" });
    } finally {
      setLoadingStaging(false);
    }
  };

  const uploadToStaging = async (files: File[], type: "video" | "thumbnail") => {
    if (files.length === 0) return;
    
    // Set appropriate upload flag and progress based on type
    if (type === "video") {
      setUploadingVideosToStaging(true);
      setStagingVideoProgress({
        currentFile: 0,
        totalFiles: files.length,
        currentFileName: "",
      });
    } else {
      setUploadingThumbnailsToStaging(true);
      setStagingThumbnailProgress({
        currentFile: 0,
        totalFiles: files.length,
        currentFileName: "",
      });
    }

    const uploadedFiles: Array<{ fileName: string; size: number; sizeFormatted: string }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    // Batch size: videos use configurable setting (default 10), thumbnails use fixed 100
    const BATCH_SIZE = type === "video" ? videoBatchSize : 100;
    let processedCount = 0;

    try {
      // Upload files in batches (size depends on type: videos=configurable, thumbnails=100)
      for (let batchStart = 0; batchStart < files.length; batchStart += BATCH_SIZE) {
        const batch = files.slice(batchStart, batchStart + BATCH_SIZE);
        const batchEnd = Math.min(batchStart + BATCH_SIZE, files.length);
        
        // Update progress before starting batch
        if (type === "video") {
          setStagingVideoProgress({
            currentFile: batchStart + 1,
            totalFiles: files.length,
            currentFileName: batch[0]?.name || "",
          });
        } else {
          setStagingThumbnailProgress({
            currentFile: batchStart + 1,
            totalFiles: files.length,
            currentFileName: batch[0]?.name || "",
          });
        }

        try {
          const formData = new FormData();
          // Append all files in this batch
          batch.forEach((file) => {
            formData.append("files", file);
          });
          formData.append("type", type);

          const response = await fetch("/api/staging/upload", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();
          if (data.success && data.files) {
            // Add all successfully uploaded files
            uploadedFiles.push(...data.files);
            processedCount += data.files.length;
            
            // Update progress after batch completes
            if (type === "video") {
              setStagingVideoProgress({
                currentFile: batchEnd,
                totalFiles: files.length,
                currentFileName: batch[batch.length - 1]?.name || "",
              });
            } else {
              setStagingThumbnailProgress({
                currentFile: batchEnd,
                totalFiles: files.length,
                currentFileName: batch[batch.length - 1]?.name || "",
              });
            }
            
            // Refresh staging files list in real-time after each batch
            await fetchStagingFiles();
            // Also refresh all uploaded files if that section is visible
            if (showAllFiles) {
              await fetchAllFiles();
            }
          }
          
          // Add any errors from this batch
          if (data.errors && data.errors.length > 0) {
            errors.push(...data.errors);
            processedCount += data.errors.length;
          }
          
          // If batch failed completely
          if (!data.success && !data.files) {
            batch.forEach((file) => {
              errors.push({
                fileName: file.name,
                error: data.error || "Upload failed",
              });
            });
            processedCount += batch.length;
          }
        } catch (error: any) {
          // If batch request fails, add all files in batch to errors
          batch.forEach((file) => {
            errors.push({
              fileName: file.name,
              error: error.message || "Upload failed",
            });
          });
          processedCount += batch.length;
        }
      }

      // Show final result
      const successCount = uploadedFiles.length;
      const errorCount = errors.length;
      let message = `${successCount} ${type === "video" ? "video(s)" : "thumbnail(s)"} uploaded to staging!`;
      if (errorCount > 0) {
        message += ` ${errorCount} failed.`;
      }
      setShowToast({ message, type: successCount > 0 ? "success" : "error" });
      await fetchStagingFiles();
      // Also refresh all uploaded files if that section is visible
      if (showAllFiles) {
        await fetchAllFiles();
      }
      
      // Clear input
      if (type === "video" && stagingVideoInputRef.current) {
        stagingVideoInputRef.current.value = "";
      } else if (type === "thumbnail" && stagingThumbnailInputRef.current) {
        stagingThumbnailInputRef.current.value = "";
      }
    } catch (error: any) {
      setShowToast({ message: error.message || "Failed to upload files", type: "error" });
    } finally {
      // Clear appropriate flags and progress
      if (type === "video") {
        setUploadingVideosToStaging(false);
        setStagingVideoProgress(null);
      } else {
        setUploadingThumbnailsToStaging(false);
        setStagingThumbnailProgress(null);
      }
    }
  };

  const deleteStagingFile = async (fileName: string, type: "video" | "thumbnail") => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    try {
      const response = await fetch(`/api/staging/delete?fileName=${encodeURIComponent(fileName)}&type=${type}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        setShowToast({ message: "File deleted from staging", type: "success" });
        await fetchStagingFiles();
      } else {
        setShowToast({ message: data.error || "Failed to delete file", type: "error" });
      }
    } catch (error: any) {
      setShowToast({ message: error.message || "Failed to delete file", type: "error" });
    }
  };

  const toggleBatchInstructions = () => {
    const newState = !showBatchInstructions;
    setShowBatchInstructions(newState);
    localStorage.setItem("showBatchInstructions", String(newState));
  };

  const handleQueueAction = async (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "delete"
  ) => {
    try {
      const res = await fetch("/api/queue-manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action }),
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

  useEffect(() => {
    fetchUser();
    fetchQueue();

    // Real-time polling - check every 1 second for near-instant updates
    const pollInterval = setInterval(() => {
      fetchQueue();
      if (selectedJobId) {
        fetchJobStatus(selectedJobId);
      }
    }, 1000); // Check every 1 second for real-time feel

    return () => clearInterval(pollInterval);
  }, [selectedJobId]);

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
    fileName: string
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete "${fileName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/delete-videos?jobId=${jobId}&filePath=${encodeURIComponent(
          filePath
        )}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "File deleted successfully",
          type: "success",
        });
        fetchJobFiles(jobId); // Refresh file list
        if (showAllFiles) {
          fetchAllFiles(); // Refresh all files view
        }
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

  const handleDeleteAllByCategory = async (fileType: "video" | "thumbnail" | "csv") => {
    if (!allFiles) return;
    
    const filesToDelete = allFiles.files.filter((f: any) => f.type === fileType);
    if (filesToDelete.length === 0) {
      setShowToast({
        message: `No ${fileType} files to delete`,
        type: "info",
      });
      return;
    }

    const categoryName = fileType === "video" ? "videos" : fileType === "thumbnail" ? "thumbnails" : "CSV files";
    if (
      !confirm(
        `Are you sure you want to delete ALL ${filesToDelete.length} ${categoryName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      // Delete files sequentially to avoid overwhelming the server
      for (const file of filesToDelete) {
        try {
          const res = await fetch(
            `/api/delete-videos?jobId=${file.jobId}&filePath=${encodeURIComponent(
              file.relativePath
            )}`,
            {
              method: "DELETE",
            }
          );
          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (successCount > 0) {
        setShowToast({
          message: `Deleted ${successCount} ${categoryName}${failCount > 0 ? ` (${failCount} failed)` : ""}`,
          type: failCount > 0 ? "info" : "success",
        });
        fetchAllFiles(); // Refresh all files view
      } else {
        setShowToast({
          message: `Failed to delete ${categoryName}`,
          type: "error",
        });
      }
    } catch (error) {
      setShowToast({
        message: `An error occurred while deleting ${categoryName}`,
        type: "error",
      });
    }
  };

  const handleDeleteAllFiles = async (jobId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete ALL uploaded files for this job? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/delete-videos?jobId=${jobId}&deleteAll=true`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json();
      if (res.ok) {
        setShowToast({
          message: data.message || "All files deleted successfully",
          type: "success",
        });
        fetchJobFiles(jobId); // Refresh file list
        if (showAllFiles) {
          fetchAllFiles(); // Refresh all files view
        }
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

  const fetchAllFiles = async () => {
    try {
      setLoadingAllFiles(true);
      const res = await fetch("/api/list-all-files");
      const data = await res.json();
      if (res.ok && data.success) {
        setAllFiles(data);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching all files:", error);
    } finally {
      setLoadingAllFiles(false);
    }
  };

  const fetchMigrationDirs = async () => {
    try {
      const res = await fetch("/api/migrate-files");
      const data = await res.json();
      if (res.ok && data.directories) {
        setMigrationDirs(data.directories);
        // Auto-select current user's directory as destination
        if (data.currentSafeUserId) {
          setMigrationDest(data.currentSafeUserId);
        }
      }
    } catch (error) {
      console.error("[ERROR] Error fetching migration directories:", error);
    }
  };

  const handleMigrateFiles = async () => {
    if (!migrationSource || !migrationDest) {
      setShowToast({ message: "Please select source and destination directories", type: "error" });
      return;
    }
    if (migrationSource === migrationDest) {
      setShowToast({ message: "Source and destination cannot be the same", type: "error" });
      return;
    }

    if (!confirm(`Migrate all files from "${migrationSource}" to "${migrationDest}"?\n\nThis will COPY files (source will remain). Delete source manually after verifying.`)) {
      return;
    }

    setMigratingFiles(true);
    try {
      const res = await fetch("/api/migrate-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDir: migrationSource,
          destDir: migrationDest,
          deleteSource: false, // Keep source for safety
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowToast({ message: `Migrated ${data.filesCopied} files successfully!`, type: "success" });
        fetchMigrationDirs();
        fetchAllFiles();
        fetchStagingFiles();
      } else {
        setShowToast({ message: data.error || "Migration failed", type: "error" });
      }
    } catch (error: any) {
      setShowToast({ message: error?.message || "Migration failed", type: "error" });
    } finally {
      setMigratingFiles(false);
    }
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
          (j) => j.status === "processing"
        ).length;
        setQueue(data.queue);

        // Debug logging
        const newQueueLength = data.queue.length;
        const newProcessingCount = data.queue.filter(
          (j: any) => j.status === "processing"
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
          (j: any) => j.status === "pending"
        );
        if (pendingJobs.length > 0) {
          pendingJobs.forEach((job: any) => {
            const ageSeconds =
              (Date.now() - new Date(job.createdAt).getTime()) / 1000;
            // Log warning if stuck for more than 15 seconds, but only every 10 seconds to avoid spam
            if (ageSeconds > 15 && Math.floor(ageSeconds) % 10 === 0) {
              const warningMsg = `⚠️ Job ${job.id.substring(
                0,
                20
              )}... stuck in pending for ${Math.round(
                ageSeconds
              )}s. Check if worker is running!`;
              console.warn(`[DEBUG] ${warningMsg}`);
              // Only add to debug log if not already there
              const lastLog = debugLogs[debugLogs.length - 1];
              if (
                !lastLog ||
                !lastLog.message.includes(job.id.substring(0, 15))
              ) {
                addDebugLog(warningMsg, "error");
              }
            }
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
      // Add cache-busting to ensure fresh data
      const res = await fetch(
        `/api/queue-status?jobId=${jobId}&t=${timestamp}`
      );
      const data = await res.json();
      if (res.ok && data.job) {
        const prevStatus = jobStatus?.status;
        const prevProgressCount = jobStatus?.progress?.length || 0;
        const prevCompletedCount =
          jobStatus?.progress?.filter(
            (p: ProgressItem) =>
              p.status.includes("Uploaded") || p.status.includes("Scheduled")
          ).length || 0;

        setJobStatus(data.job);

        // Debug logging for progress changes
        const newProgressCount = data.job.progress?.length || 0;
        const newCompletedCount =
          data.job.progress?.filter(
            (p: ProgressItem) =>
              p.status.includes("Uploaded") ||
              p.status.includes("Scheduled") ||
              p.status.includes("scheduled")
          ).length || 0;

        // Only log meaningful changes
        if (
          data.job.status !== prevStatus ||
          newProgressCount !== prevProgressCount ||
          newCompletedCount !== prevCompletedCount
        ) {
          const statusChange =
            prevStatus && prevStatus !== data.job.status
              ? `Status: ${prevStatus}→${data.job.status}`
              : "";
          const progressChange =
            newCompletedCount !== prevCompletedCount
              ? `Completed: ${prevCompletedCount}→${newCompletedCount}`
              : "";
          const logMsg = `Job ${jobId.substring(
            0,
            20
          )}... ${statusChange} ${progressChange}`.trim();
          if (logMsg.length > 20) {
            // Only log if there's actual content
            console.log(`[DEBUG] ${logMsg}`);
            addDebugLog(
              logMsg,
              newCompletedCount > prevCompletedCount
                ? "success"
                : data.job.status === "processing"
                ? "info"
                : "info"
            );
          }
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

  const handleCsvUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCsvUploading(true);
    setMessage({ type: null, text: null });
    setShowProgress(false);
    setProgress([]);

    // Store form reference before async operation
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Validate scheduling settings
    // Scheduling is now handled via publishAt dates in CSV
    formData.append("enableScheduling", "true");

    try {
      // Show copying message
      setMessage({ type: "info", text: "Copying files to server storage..." });
      setUploadProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: "",
        message: "Starting upload...",
        status: "copying",
      });

      // Get session ID from cookies for progress tracking
      const getSessionIdFromCookies = (): string | null => {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split("=");
          if (name === "sessionId") {
            return decodeURIComponent(value);
          }
        }
        return null;
      };

      const currentSessionId = getSessionIdFromCookies();

      // Start polling for progress updates
      const progressPollInterval = setInterval(async () => {
        try {
          if (!currentSessionId) return;
          const progressRes = await fetch(
            `/api/upload-progress?sessionId=${encodeURIComponent(
              currentSessionId
            )}`
          );
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            setUploadProgress({
              currentFile: progressData.currentFile || 0,
              totalFiles: progressData.totalFiles || 0,
              currentFileName: progressData.currentFileName || "",
              message: progressData.message || "Processing...",
              status: progressData.status || "copying",
              copyStats: progressData.copyStats,
            });

            // Stop polling if completed or error
            if (
              progressData.status === "completed" ||
              progressData.status === "error"
            ) {
              clearInterval(progressPollInterval);
              setUploadProgressInterval(null);
            }
          }
        } catch (error) {
          console.error("Error polling upload progress:", error);
        }
      }, 500); // Poll every 500ms for real-time updates

      setUploadProgressInterval(progressPollInterval);

      const res = await fetch("/api/upload-queue", {
        method: "POST",
        body: formData,
      });

      // Stop polling once request completes
      clearInterval(progressPollInterval);
      setUploadProgressInterval(null);

      const data = await res.json();
      if (res.ok && data.success) {
        // Build detailed message with copy stats
        let message = `✅ Files Successfully Uploaded!\n\n`;
        message += `📊 ${data.totalVideos} videos queued for processing\n`;
        message += `🆔 Job ID: ${data.jobId}\n\n`;

        if (data.copyStats) {
          message += `📁 Files Copied:\n`;
          message += `  ✅ ${data.copyStats.videosCopied} videos`;
          if (data.copyStats.videosSkipped > 0) {
            message += ` (⚠️ ${data.copyStats.videosSkipped} skipped)`;
          }
          message += `\n`;

          if (data.copyStats.thumbnailsCopied > 0) {
            message += `  🖼️ ${data.copyStats.thumbnailsCopied} thumbnails`;
            if (data.copyStats.thumbnailsSkipped > 0) {
              message += ` (${data.copyStats.thumbnailsSkipped} skipped)`;
            }
            message += `\n`;
          }

          if (data.copyStats.errors && data.copyStats.errors.length > 0) {
            message += `\n⚠️ ${data.copyStats.errors.length} error(s) during copy`;
          }
        }

        message += `\n\n⚡ The first video will start uploading immediately! Remaining videos will be processed according to your schedule.`;

        setShowToast({
          message: message.trim(),
          type: data.copyStats?.errors?.length > 0 ? "info" : "success",
        });
        setMessage({
          type: "success",
          text: `✅ Successfully uploaded ${data.totalVideos} videos! The first video will start uploading immediately. Check the queue below for progress.`,
        });
        // Reset form using stored reference
        if (form) {
          form.reset();
        }
        setSelectedCsvFile(null); // Reset CSV file selection
        setSelectedVideoFiles([]); // Reset video files selection
        setSelectedThumbnailFiles([]); // Reset thumbnail files selection

        // Immediately fetch queue and job status
        setSelectedJobId(data.jobId);
        fetchQueue();
        fetchJobStatus(data.jobId);

        // Aggressive polling for the first minute to catch immediate progress
        let pollCount = 0;
        const rapidPoll = setInterval(() => {
          fetchQueue();
          fetchJobStatus(data.jobId);
          pollCount++;
          if (pollCount >= 60) {
            // 60 * 1 second = 60 seconds
            clearInterval(rapidPoll);
          }
        }, 1000); // Poll every 1 second for real-time updates
      } else {
        console.error("=== BULK UPLOAD ERROR (Client) ===");
        console.error("Error:", data.error);
        console.error("Details:", data.details);
        console.error("Code:", data.code);
        console.error("Status:", data.status);
        console.error("Full response:", data);
        console.error("==================================");

        const errorMsg = data.error || "Error uploading files";
        setShowToast({ message: errorMsg, type: "error" });
        setMessage({ type: "error", text: errorMsg });
      }
    } catch (error: any) {
      console.error("=== BULK UPLOAD EXCEPTION (Client) ===");
      console.error("Error:", error);
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      console.error("======================================");

      const errorMsg =
        error?.message || "An error occurred while uploading files.";
      setShowToast({ message: errorMsg, type: "error" });
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setCsvUploading(false);
      // Reset CSV file input after upload completes
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = "";
        setSelectedCsvFile(null);
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !confirm(
        "Are you sure you want to delete your account data and revoke access? This action can be undone by reauthorizing the app."
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/delete-account", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Account deletion requested.");
        router.push("/");
      } else {
        alert(data.message || "Failed to delete account.");
      }
    } catch (err) {
      console.error(err);
      alert("Error: Could not reach the server.");
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

  // Calculate statistics
  const allProgress = queue.flatMap((job) => job.progress || []);
  const totalVideos = queue.reduce((sum, job) => {
    return sum + (job.totalVideos || job.progress?.length || 0);
  }, 0);

  const completed = allProgress.filter(
    (p) =>
      p.status.includes("Uploaded") ||
      p.status.includes("scheduled") ||
      p.status.includes("Scheduled") ||
      p.status.includes("Already uploaded")
  ).length;

  const failed = allProgress.filter(
    (p) =>
      p.status.includes("Failed") ||
      p.status.includes("Missing") ||
      p.status.includes("Invalid") ||
      p.status.includes("not found") ||
      p.status.includes("Cannot access") ||
      p.status.includes("error")
  ).length;

  const pending = allProgress.filter(
    (p) =>
      p.status === "Pending" ||
      p.status.includes("Uploading") ||
      p.status.includes("thumbnail") ||
      p.status.includes("Checking")
  ).length;

  const processing = queue.filter((job) => job.status === "processing").length;
  const completedJobs = queue.filter(
    (job) => job.status === "completed"
  ).length;
  const failedJobs = queue.filter((job) => job.status === "failed").length;
  const pendingJobs = queue.filter((job) => job.status === "pending").length;

  const progressPercentage =
    totalVideos > 0
      ? Math.round((completed / totalVideos) * 100)
      : completedJobs > 0 && queue.length === completedJobs
      ? 100
      : 0;

  const remaining = totalVideos > 0 ? totalVideos - completed - failed : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 pb-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent mb-2">
              ZonDiscounts Uploader
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your YouTube video uploads
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Profile Section in Header */}
            {user && (
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-red-50 via-pink-50 to-red-50 dark:from-red-900/20 dark:via-pink-900/20 dark:to-red-900/20 rounded-xl border-2 border-red-100 dark:border-red-800/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl"></div>
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-red-600 dark:border-red-400 shadow-lg relative z-10"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <span className="text-green-500">✓</span>
                    <span>Connected</span>
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                title="Toggle Debug Panel"
              >
                🐛 Debug
              </button>
              <button
                onClick={toggleDarkMode}
                className="px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                aria-label="Toggle dark mode"
              >
                {darkMode ? "☀️ Light" : "🌙 Dark"}
              </button>
              <a href="/api/auth/logout" className="btn-primary">
                Logout
              </a>
              <button
                onClick={handleDeleteAccount}
                className="btn-secondary bg-red-600 hover:bg-red-700"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>

        {/* Toast Notification */}
        {showToast && (
          <Toast
            message={showToast.message}
            type={showToast.type}
            onClose={() => setShowToast(null)}
            duration={showToast.type === "info" ? 8000 : 5000}
          />
        )}

        {/* Keyboard Shortcuts Help */}
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg text-xs text-blue-800 dark:text-blue-200">
          <strong>⌨️ Keyboard Shortcuts:</strong>{" "}
          <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">
            Ctrl/Cmd+K
          </kbd>{" "}
          Debug Panel |{" "}
          <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">
            Ctrl/Cmd+E
          </kbd>{" "}
          Export Stats |{" "}
          <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">
            Esc
          </kbd>{" "}
          Close Details
        </div>

        {/* Debug Panel */}
        {showDebugPanel && (
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
              Polling: Every 1s | Queue updates logged | Job progress tracked
            </div>

            {/* File Migration Tool */}
            <div className="mt-6 pt-4 border-t border-purple-700">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-md font-bold text-yellow-400 flex items-center gap-2">
                  <span>📁</span>
                  <span>File Migration Tool</span>
                </h4>
                <button
                  onClick={fetchMigrationDirs}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg"
                >
                  Refresh Directories
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Use this to consolidate files from different channel logins into one directory.
              </p>
              
              {migrationDirs.length === 0 ? (
                <button
                  onClick={fetchMigrationDirs}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                >
                  Load Directories
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Source Directory</label>
                      <select
                        value={migrationSource}
                        onChange={(e) => setMigrationSource(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="">Select source...</option>
                        {migrationDirs.map((dir) => (
                          <option key={dir.name} value={dir.name}>
                            {dir.name} ({dir.fileCount} files, {dir.jobCount} jobs)
                            {dir.isCurrentUser ? " ✓ Current" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Destination Directory</label>
                      <select
                        value={migrationDest}
                        onChange={(e) => setMigrationDest(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="">Select destination...</option>
                        {migrationDirs.map((dir) => (
                          <option key={dir.name} value={dir.name}>
                            {dir.name} ({dir.fileCount} files)
                            {dir.isCurrentUser ? " ✓ Current" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleMigrateFiles}
                      disabled={migratingFiles || !migrationSource || !migrationDest}
                      className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
                    >
                      {migratingFiles ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                          Migrating...
                        </>
                      ) : (
                        <>📤 Migrate Files</>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Files will be COPIED (not moved). Delete the source directory manually after verifying.
                  </p>
                </div>
              )}
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

        {/* Next Upload Timer - Single Display */}
        {nextUploadTime && timeUntilNext && (
          <div className="mb-8 p-6 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-2xl shadow-xl text-white relative overflow-hidden animate-fade-in">
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="text-5xl animate-pulse-slow">⏰</div>
                <div>
                  <div className="text-sm opacity-90 mb-1 font-medium uppercase tracking-wide">
                    Next Upload Batch
                  </div>
                  <div className="text-3xl font-bold mb-2">{timeUntilNext}</div>
                  <div className="text-sm opacity-90 mt-1">
                    {nextUploadTime.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-xs opacity-75 mt-2 flex items-center gap-2">
                    <span>🔄</span>
                    <span>Uploads run every 24 hours</span>
                  </div>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-5xl animate-pulse-slow opacity-80">⏳</div>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Dashboard */}
        {queue.length === 0 ? (
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl p-12 mb-10 text-center text-white">
            <div className="text-5xl mb-5">📊</div>
            <h2 className="text-3xl font-bold mb-4">
              Welcome to Your Upload Dashboard
            </h2>
            <p className="text-lg opacity-95 mb-8 max-w-2xl mx-auto">
              Start uploading videos to see real-time statistics, progress
              tracking, and detailed analytics.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-2xl mx-auto mt-8">
              <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
                <div className="text-4xl font-bold">0</div>
                <div className="text-sm opacity-90 mt-2">Total Videos</div>
              </div>
              <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
                <div className="text-4xl font-bold">0</div>
                <div className="text-sm opacity-90 mt-2">Completed</div>
              </div>
              <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
                <div className="text-4xl font-bold">0</div>
                <div className="text-sm opacity-90 mt-2">Jobs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card border border-gray-100 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                📊 Upload Statistics
              </h2>
              <div
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  processing > 0
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {processing > 0 ? "⚡ Processing" : "✓ Ready"}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">
                  Overall Progress
                </span>
                <span className="font-bold text-gray-800 dark:text-white text-lg">
                  {progressPercentage}%
                </span>
              </div>
              <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out flex items-center justify-center text-white font-bold text-xs shadow-lg ${
                    progressPercentage === 100
                      ? "bg-gradient-to-r from-green-500 to-emerald-600"
                      : "bg-gradient-to-r from-red-600 via-red-500 to-pink-600"
                  }`}
                  style={{ width: `${progressPercentage}%` }}
                >
                  {progressPercentage > 15 &&
                    progressPercentage < 100 &&
                    `${progressPercentage}%`}
                  {progressPercentage === 100 && "✓ Complete"}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <div className="stat-card group hover:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Total Videos
                  </div>
                  <div className="text-2xl">📹</div>
                </div>
                <div className="text-4xl font-bold text-gray-800 dark:text-white mb-1">
                  {totalVideos}
                </div>
              </div>
              <div className="stat-card bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800 group hover:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                    Completed
                  </div>
                  <div className="text-2xl">✅</div>
                </div>
                <div className="text-4xl font-bold text-green-700 dark:text-green-300 mb-1">
                  {completed}
                </div>
                {totalVideos > 0 && (
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {Math.round((completed / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>
              <div className="stat-card bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800 group hover:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">
                    Processing
                  </div>
                  <div className="text-2xl animate-pulse-slow">⚡</div>
                </div>
                <div className="text-4xl font-bold text-yellow-700 dark:text-yellow-300 mb-1">
                  {pending}
                </div>
                {totalVideos > 0 && (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    {Math.round((pending / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>
              <div className="stat-card bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-red-200 dark:border-red-800 group hover:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
                    Failed
                  </div>
                  <div className="text-2xl">❌</div>
                </div>
                <div className="text-4xl font-bold text-red-700 dark:text-red-300 mb-1">
                  {failed}
                </div>
                {totalVideos > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {Math.round((failed / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>
            </div>

            {/* Job Status Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 rounded-xl">
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600">
                  {queue.length}
                </div>
                <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-teal-600">
                  {completedJobs}
                </div>
                <div className="text-sm text-gray-600 mt-1">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-500">
                  {processing}
                </div>
                <div className="text-sm text-gray-600 mt-1">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-500">
                  {pendingJobs}
                </div>
                <div className="text-sm text-gray-600 mt-1">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-pink-500">
                  {failedJobs}
                </div>
                <div className="text-sm text-gray-600 mt-1">Failed</div>
              </div>
            </div>

            {/* Remaining Videos */}
            {remaining > 0 && (
              <div
                className={`mt-6 p-4 rounded-lg text-center ${
                  remaining > 0
                    ? "bg-yellow-50 border border-yellow-300"
                    : "bg-green-50 border border-green-300"
                }`}
              >
                <div
                  className={`text-lg font-semibold mb-1 ${
                    remaining > 0 ? "text-yellow-800" : "text-green-800"
                  }`}
                >
                  {remaining > 0
                    ? `${remaining} videos remaining`
                    : "All videos processed!"}
                </div>
                {remaining > 0 && (
                  <div className="text-sm text-yellow-700">
                    {processing > 0
                      ? "Worker is processing videos..."
                      : "Waiting for worker to process..."}
                  </div>
                )}
              </div>
            )}

            {totalVideos === 0 && queue.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <div className="text-sm text-blue-900">
                  Jobs are queued. Statistics will appear once processing
                  begins.
                </div>
              </div>
            )}
          </div>
        )}

        {/* All Uploaded Files Section */}
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <span className="text-3xl">📁</span>
              <span>All Uploaded Files</span>
            </h2>
            <button
              onClick={() => {
                setShowAllFiles(!showAllFiles);
                if (!showAllFiles && !allFiles) {
                  fetchAllFiles();
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              {showAllFiles ? "Hide" : "View All Files"}
            </button>
          </div>

          {showAllFiles && (
            <div>
              {loadingAllFiles ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 dark:border-white mb-3"></div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Loading all files...
                  </p>
                </div>
              ) : allFiles && allFiles.totalFiles > 0 ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {allFiles.totalFiles}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Total Files
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                        {allFiles.videoCount || 0}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Videos
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {allFiles.thumbnailCount || 0}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        Thumbnails
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                        {allFiles.csvCount || 0}
                      </div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                        CSV Files
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                        {allFiles.totalSizeFormatted}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Total Size
                      </div>
                    </div>
                  </div>

                  {/* Files Categorized by Type */}
                  <div className="mt-6 space-y-4">
                    {/* Videos Category */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                        <button
                          onClick={() => setExpandedCategories(prev => ({ ...prev, videos: !prev.videos }))}
                          className="flex-1 flex items-center justify-between hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/30 dark:hover:to-emerald-900/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">📹</span>
                            <div className="text-left">
                              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                Videos ({allFiles.videoCount})
                              </h3>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {allFiles.files.filter((f: any) => f.type === "video").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                                  ? `${((allFiles.files.filter((f: any) => f.type === "video").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024 / 1024).toFixed(2)} MB total`
                                  : "No videos"}
                              </p>
                            </div>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">
                            {expandedCategories.videos ? "▼" : "▶"}
                          </span>
                        </button>
                        {allFiles.files.filter((f: any) => f.type === "video").length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAllByCategory("video");
                            }}
                            className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                            title="Delete all videos"
                          >
                            🗑️ Delete All
                          </button>
                        )}
                      </div>
                      {expandedCategories.videos && (
                        <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                          {allFiles.files.filter((f: any) => f.type === "video").length > 0 ? (
                            allFiles.files.filter((f: any) => f.type === "video").map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="text-xl">📹</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                      {file.fileName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      <span>{file.sizeFormatted}</span>
                                      <span>•</span>
                                      <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                      <span>•</span>
                                      <span className={`px-2 py-0.5 rounded text-xs ${
                                        file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                        file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                        file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                        "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                      }`}>
                                        {file.jobStatus}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 ml-3">
                                  <a
                                    href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                    download={file.fileName}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                    title={`Download ${file.fileName}`}
                                  >
                                    ⬇️ Download
                                  </a>
                                  <button
                                    onClick={() => {
                                      setSelectedJobId(file.jobId);
                                      setShowAllFiles(false);
                                      fetchJobFiles(file.jobId);
                                    }}
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title="View job details"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title={`Delete ${file.fileName}`}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              No videos found
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Thumbnails Category */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
                        <button
                          onClick={() => setExpandedCategories(prev => ({ ...prev, thumbnails: !prev.thumbnails }))}
                          className="flex-1 flex items-center justify-between hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">🖼️</span>
                            <div className="text-left">
                              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                Thumbnails ({allFiles.thumbnailCount})
                              </h3>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {allFiles.files.filter((f: any) => f.type === "thumbnail").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                                  ? `${((allFiles.files.filter((f: any) => f.type === "thumbnail").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024).toFixed(2)} KB total`
                                  : "No thumbnails"}
                              </p>
                            </div>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">
                            {expandedCategories.thumbnails ? "▼" : "▶"}
                          </span>
                        </button>
                        {allFiles.files.filter((f: any) => f.type === "thumbnail").length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAllByCategory("thumbnail");
                            }}
                            className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                            title="Delete all thumbnails"
                          >
                            🗑️ Delete All
                          </button>
                        )}
                      </div>
                      {expandedCategories.thumbnails && (
                        <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                          {allFiles.files.filter((f: any) => f.type === "thumbnail").length > 0 ? (
                            allFiles.files.filter((f: any) => f.type === "thumbnail").map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="text-xl">🖼️</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                      {file.fileName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      <span>{file.sizeFormatted}</span>
                                      <span>•</span>
                                      <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                      <span>•</span>
                                      <span className={`px-2 py-0.5 rounded text-xs ${
                                        file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                        file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                        file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                        "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                      }`}>
                                        {file.jobStatus}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 ml-3">
                                  <a
                                    href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                    download={file.fileName}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                    title={`Download ${file.fileName}`}
                                  >
                                    ⬇️ Download
                                  </a>
                                  <button
                                    onClick={() => {
                                      setSelectedJobId(file.jobId);
                                      setShowAllFiles(false);
                                      fetchJobFiles(file.jobId);
                                    }}
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title="View job details"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title={`Delete ${file.fileName}`}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              No thumbnails found
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CSV Files Category */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                        <button
                          onClick={() => setExpandedCategories(prev => ({ ...prev, csvs: !prev.csvs }))}
                          className="flex-1 flex items-center justify-between hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">📄</span>
                            <div className="text-left">
                              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                CSV Files ({allFiles.csvCount})
                              </h3>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {allFiles.files.filter((f: any) => f.type === "csv").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                                  ? `${((allFiles.files.filter((f: any) => f.type === "csv").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024).toFixed(2)} KB total`
                                  : "No CSV files"}
                              </p>
                            </div>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">
                            {expandedCategories.csvs ? "▼" : "▶"}
                          </span>
                        </button>
                        {allFiles.files.filter((f: any) => f.type === "csv").length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAllByCategory("csv");
                            }}
                            className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                            title="Delete all CSV files"
                          >
                            🗑️ Delete All
                          </button>
                        )}
                      </div>
                      {expandedCategories.csvs && (
                        <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                          {allFiles.files.filter((f: any) => f.type === "csv").length > 0 ? (
                            allFiles.files.filter((f: any) => f.type === "csv").map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="text-xl">📄</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                      {file.fileName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      <span>{file.sizeFormatted}</span>
                                      <span>•</span>
                                      <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                      <span>•</span>
                                      <span className={`px-2 py-0.5 rounded text-xs ${
                                        file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                        file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                        file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                        "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                      }`}>
                                        {file.jobStatus}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 ml-3">
                                  <a
                                    href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                    download={file.fileName}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                    title={`Download ${file.fileName}`}
                                  >
                                    ⬇️ Download
                                  </a>
                                  <button
                                    onClick={() => {
                                      setSelectedJobId(file.jobId);
                                      setShowAllFiles(false);
                                      fetchJobFiles(file.jobId);
                                    }}
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title="View job details"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                    title={`Delete ${file.fileName}`}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              No CSV files found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-5xl mb-3">📭</div>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">
                    No files found on server
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    Upload videos using the batch upload form to see them here
                  </p>
                  {allFiles?.debug && (
                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-left text-xs">
                      <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Debug Info:</p>
                      <p className="text-yellow-700 dark:text-yellow-300">Session: {allFiles.debug.sessionId}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">User ID: {allFiles.debug.userId}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">Safe User ID: {allFiles.debug.safeUserId}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">Uploads dir exists: {allFiles.debug.uploadsDirExists ? "Yes" : "No"}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">User dir exists: {allFiles.debug.userDirExists ? "Yes" : "No"}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">Session dir exists: {allFiles.debug.sessionDirExists ? "Yes" : "No"}</p>
                      <p className="text-yellow-700 dark:text-yellow-300">Jobs in queue: {allFiles.jobs}</p>
                      <p className="text-yellow-700 dark:text-yellow-300 mt-2 text-xs">
                        Files are stored in: <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">/uploads/{'<user-id>'}/{'<job-id>'}/</code>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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

        {/* Staging Area - Upload Files Before CSV */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <span className="text-3xl">📁</span>
              <span>Staging Area (Upload Files First)</span>
            </h2>
            <button
              type="button"
              onClick={toggleStaging}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              {showStaging ? "Hide" : "Show"}
            </button>
          </div>
          {showStaging && (
            <>
              <div className="mb-5 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                  <strong>💡 Workflow:</strong> Upload videos and thumbnails individually here first. Then upload your CSV file in the "Batch Upload" section below. The CSV will automatically match files by filename.
                </p>
              </div>

              {/* Upload Settings */}
              <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg">
                <h3 className="text-md font-semibold mb-3 text-gray-800 dark:text-white">Upload Settings</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="videoBatchSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Video Batch Size
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        id="videoBatchSize"
                        min="1"
                        max="100"
                        value={videoBatchSize}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          if (!isNaN(value) && value > 0 && value <= 100) {
                            setVideoBatchSize(value);
                            localStorage.setItem("videoBatchSize", value.toString());
                          }
                        }}
                        className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        videos per batch (default: 10)
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Smaller batches = more frequent progress updates but slower upload. Larger batches = faster upload but less frequent updates.
                    </p>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <strong>Thumbnail batch size:</strong> Fixed at 100 per batch (thumbnails are small, so larger batches are fine)
                  </div>
                </div>
              </div>

              {/* Upload Progress Display */}
              {(stagingVideoProgress || stagingThumbnailProgress) && (
                <div className="mb-6 space-y-4">
                  {/* Video Upload Progress */}
                  {stagingVideoProgress && (
                    <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                            <div className="animate-spin text-xl">📤</div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                            Uploading Videos to Staging
                          </h4>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            {stagingVideoProgress.currentFileName || "Preparing..."}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-blue-800 dark:text-blue-200 font-medium">
                            Asset {stagingVideoProgress.currentFile} / {stagingVideoProgress.totalFiles}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400 font-bold">
                            {Math.round(
                              (stagingVideoProgress.currentFile / stagingVideoProgress.totalFiles) * 100
                            )}%
                          </span>
                        </div>
                        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(stagingVideoProgress.currentFile / stagingVideoProgress.totalFiles) * 100}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {stagingVideoProgress.currentFile === stagingVideoProgress.totalFiles
                          ? "Finalizing upload..."
                          : `Uploading file ${stagingVideoProgress.currentFile} of ${stagingVideoProgress.totalFiles}...`}
                      </div>
                    </div>
                  )}

                  {/* Thumbnail Upload Progress */}
                  {stagingThumbnailProgress && (
                    <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl dark:from-green-900/30 dark:to-emerald-900/30 dark:border-green-700 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                            <div className="animate-spin text-xl">🖼️</div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-green-900 dark:text-green-100">
                            Uploading Thumbnails to Staging
                          </h4>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            {stagingThumbnailProgress.currentFileName || "Preparing..."}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-green-800 dark:text-green-200 font-medium">
                            Asset {stagingThumbnailProgress.currentFile} / {stagingThumbnailProgress.totalFiles}
                          </span>
                          <span className="text-green-600 dark:text-green-400 font-bold">
                            {Math.round(
                              (stagingThumbnailProgress.currentFile / stagingThumbnailProgress.totalFiles) * 100
                            )}%
                          </span>
                        </div>
                        <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(stagingThumbnailProgress.currentFile / stagingThumbnailProgress.totalFiles) * 100}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-xs text-green-600 dark:text-green-400">
                        {stagingThumbnailProgress.currentFile === stagingThumbnailProgress.totalFiles
                          ? "Finalizing upload..."
                          : `Uploading file ${stagingThumbnailProgress.currentFile} of ${stagingThumbnailProgress.totalFiles}...`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Upload Video */}
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
                    uploadingVideosToStaging
                      ? "border-gray-400 bg-gray-100 dark:bg-gray-800"
                      : "border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400"
                  }`}
                  onClick={() => !uploadingVideosToStaging && stagingVideoInputRef.current?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (uploadingVideosToStaging) return;
                    const files = Array.from(e.dataTransfer.files).filter(
                      (file) => file.type.startsWith("video/")
                    );
                    if (files.length > 0) {
                      uploadToStaging(files, "video");
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploadingVideosToStaging) {
                      e.currentTarget.classList.add("border-purple-500", "bg-purple-50", "dark:bg-purple-900/20");
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-purple-500", "bg-purple-50", "dark:bg-purple-900/20");
                  }}
                >
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Upload Videos</h3>
                  <input
                    ref={stagingVideoInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter(
                        (file) => file.type.startsWith("video/")
                      );
                      if (files.length > 0) {
                        uploadToStaging(files, "video");
                      }
                    }}
                    disabled={uploadingVideosToStaging}
                  />
                  <div className="text-center py-4">
                    <div className="text-4xl mb-2">📹</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-1 font-semibold">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Upload multiple MP4 or other video files
                    </p>
                  </div>
                </div>

                {/* Upload Thumbnail */}
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
                    uploadingThumbnailsToStaging
                      ? "border-gray-400 bg-gray-100 dark:bg-gray-800"
                      : "border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400"
                  }`}
                  onClick={() => !uploadingThumbnailsToStaging && stagingThumbnailInputRef.current?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (uploadingThumbnailsToStaging) return;
                    const files = Array.from(e.dataTransfer.files).filter(
                      (file) => file.type.startsWith("image/") || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                    );
                    if (files.length > 0) {
                      uploadToStaging(files, "thumbnail");
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploadingThumbnailsToStaging) {
                      e.currentTarget.classList.add("border-purple-500", "bg-purple-50", "dark:bg-purple-900/20");
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-purple-500", "bg-purple-50", "dark:bg-purple-900/20");
                  }}
                >
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Upload Thumbnails</h3>
                  <input
                    ref={stagingThumbnailInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter(
                        (file) => file.type.startsWith("image/") || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      );
                      if (files.length > 0) {
                        uploadToStaging(files, "thumbnail");
                      }
                    }}
                    disabled={uploadingThumbnailsToStaging}
                  />
                  <div className="text-center py-4">
                    <div className="text-4xl mb-2">🖼️</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-1 font-semibold">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Upload multiple JPG, PNG, or other image files
                    </p>
                  </div>
                </div>
              </div>

              {/* Staged Files List */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Staged Files</h3>
                  <button
                    type="button"
                    onClick={fetchStagingFiles}
                    disabled={loadingStaging}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingStaging ? "Loading..." : "🔄 Refresh"}
                  </button>
                </div>

                {loadingStaging ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : stagingFiles ? (
                  <>
                    {/* Summary */}
                    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Videos:</span>
                          <span className="ml-2 font-semibold text-gray-800 dark:text-white">{stagingFiles.totals.videoCount}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Thumbnails:</span>
                          <span className="ml-2 font-semibold text-gray-800 dark:text-white">{stagingFiles.totals.thumbnailCount}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Video Size:</span>
                          <span className="ml-2 font-semibold text-gray-800 dark:text-white">{stagingFiles.totals.totalVideoSizeFormatted}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Thumbnail Size:</span>
                          <span className="ml-2 font-semibold text-gray-800 dark:text-white">{stagingFiles.totals.totalThumbnailSizeFormatted}</span>
                        </div>
                      </div>
                    </div>

                    {/* Videos List */}
                    {stagingFiles.videos.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Videos ({stagingFiles.videos.length})</h4>
                        <div className="space-y-2">
                          {stagingFiles.videos.map((video) => (
                            <div
                              key={video.name}
                              className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-800 dark:text-white">{video.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {video.sizeFormatted} • Uploaded {new Date(video.uploadedAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex gap-2 ml-4">
                                <a
                                  href={`/api/download-file?staging=true&fileName=${encodeURIComponent(video.name)}&type=video`}
                                  download={video.name}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  title={`Download ${video.name}`}
                                >
                                  ⬇️ Download
                                </a>
                                <button
                                  type="button"
                                  onClick={() => deleteStagingFile(video.name, "video")}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Thumbnails List */}
                    {stagingFiles.thumbnails.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Thumbnails ({stagingFiles.thumbnails.length})</h4>
                        <div className="space-y-2">
                          {stagingFiles.thumbnails.map((thumb) => (
                            <div
                              key={thumb.name}
                              className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-800 dark:text-white">{thumb.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {thumb.sizeFormatted} • Uploaded {new Date(thumb.uploadedAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex gap-2 ml-4">
                                <a
                                  href={`/api/download-file?staging=true&fileName=${encodeURIComponent(thumb.name)}&type=thumbnail`}
                                  download={thumb.name}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  title={`Download ${thumb.name}`}
                                >
                                  ⬇️ Download
                                </a>
                                <button
                                  type="button"
                                  onClick={() => deleteStagingFile(thumb.name, "thumbnail")}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {stagingFiles.videos.length === 0 && stagingFiles.thumbnails.length === 0 && (
                      <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <p className="text-gray-600 dark:text-gray-400">No files in staging area</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Upload videos and thumbnails above</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={fetchStagingFiles}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Load Staging Files
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Batch Upload */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <span className="text-3xl">📦</span>
              <span>Batch Upload from CSV (Background Processing)</span>
            </h2>
            <button
              type="button"
              onClick={toggleBatchUpload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              {showBatchUpload ? "Hide" : "Show"}
            </button>
          </div>
          {showBatchUpload && (
            <>
              {/* Quick Info Banner */}
              <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                      <strong>🚀 Background Processing:</strong> Upload CSV and
                      video files. The system processes them automatically in
                      the background. You can close your browser and check
                      status later.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleBatchInstructions}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {showBatchInstructions
                      ? "📖 Hide Instructions"
                      : "📖 Show Instructions"}
                  </button>
                </div>
              </div>

              {/* Collapsible Instructions */}
              {showBatchInstructions && (
                <div className="mb-5 space-y-3 animate-fade-in">
                  <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <h3 className="font-semibold mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                      <span>📋</span>
                      <span>CSV File Format</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Required Columns:
                        </div>
                        <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              youtube_title
                            </code>
                          </li>
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              youtube_description
                            </code>
                          </li>
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              path
                            </code>
                          </li>
                        </ul>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Optional Columns:
                        </div>
                        <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              thumbnail_path
                            </code>
                          </li>
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              scheduleTime
                            </code>
                          </li>
                          <li>
                            •{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              privacyStatus
                            </code>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">✅</span>
                      <div className="flex-1">
                        <strong className="text-green-900 dark:text-green-100">
                          File Upload Feature:
                        </strong>
                        <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                          Upload videos and thumbnails in the Staging Area above first, then upload your CSV here. The system
                          automatically matches files by filename. Use Windows
                          paths (e.g.,{" "}
                          <code className="bg-green-100 dark:bg-green-800 px-1 rounded">
                            C:\Users\...\video.mp4
                          </code>
                          ) in your CSV.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">💡</span>
                      <div className="flex-1">
                        <strong className="text-blue-900 dark:text-blue-100">
                          How It Works:
                        </strong>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                          The system extracts filenames from CSV paths and
                          matches them to files in the Staging Area. Files uploaded to staging
                          are automatically matched by filename when you upload your CSV.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">📝</span>
                      <div className="flex-1">
                        <strong className="text-purple-900 dark:text-purple-100">
                          Description Formatting:
                        </strong>
                        <p className="text-sm text-purple-800 dark:text-purple-200 mt-1">
                          Supports multi-line text (
                          <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">
                            \n
                          </code>
                          ), emojis, links, and hashtags. Ensure CSV fields are
                          properly quoted for line breaks.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <form onSubmit={handleCsvUpload} className="flex flex-col gap-5">
                <label htmlFor="csvFile" className="label">
                  Upload CSV
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                    selectedCsvFile
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-300 hover:border-red-500"
                  }`}
                  onClick={() => csvFileInputRef.current?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (
                      file &&
                      (file.name.endsWith(".csv") || file.type === "text/csv")
                    ) {
                      setSelectedCsvFile(file);
                      if (csvFileInputRef.current) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        csvFileInputRef.current.files = dataTransfer.files;
                      }
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    id="csvFile"
                    name="csvFile"
                    accept=".csv"
                    required
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedCsvFile(file);
                        setCsvValidationErrors([]);
                        const errors = await validateCsv(file);
                        setCsvValidationErrors(errors);
                        if (errors.length === 0) {
                          setShowToast({
                            message: "CSV validation passed!",
                            type: "success",
                          });
                        } else {
                          setShowToast({
                            message: `CSV validation found ${errors.length} error(s)`,
                            type: "error",
                          });
                        }
                      }
                    }}
                  />
                  {selectedCsvFile ? (
                    <div>
                      <div className="text-4xl mb-2">
                        {csvValidationErrors.length === 0 ? "✅" : "⚠️"}
                      </div>
                      <p
                        className={`font-semibold mb-1 ${
                          csvValidationErrors.length === 0
                            ? "text-green-700 dark:text-green-300"
                            : "text-yellow-700 dark:text-yellow-300"
                        }`}
                      >
                        {selectedCsvFile.name}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {(selectedCsvFile.size / 1024).toFixed(2)} KB
                      </p>
                      {csvValidationErrors.length > 0 && (
                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-200 max-h-32 overflow-y-auto">
                          <strong>Validation Errors:</strong>
                          <ul className="list-disc list-inside mt-1 space-y-0.5">
                            {csvValidationErrors
                              .slice(0, 5)
                              .map((error, idx) => (
                                <li key={idx}>{error}</li>
                              ))}
                            {csvValidationErrors.length > 5 && (
                              <li>
                                ... and {csvValidationErrors.length - 5} more
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        Click to change file
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="text-4xl mb-2">📄</div>
                      <p className="text-gray-600 dark:text-gray-400 mb-1">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500">
                        CSV files only
                      </p>
                    </>
                  )}
                </div>

                <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-4">
                    Upload Scheduling Settings
                  </h3>
                  
                  <div className="flex flex-col gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                      <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>📅 Scheduling:</strong> Use the <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">scheduleTime</code> column in your CSV to set publish dates. Videos will be uploaded immediately and YouTube will publish them automatically at the scheduled times.
                      </p>
                    </div>

                    <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                      <strong>Note:</strong> Videos are uploaded immediately but scheduled to publish on their
                      assigned dates. All videos will be uploaded as private
                      initially (required for scheduling), then updated to
                      your CSV&apos;s privacyStatus if possible.
                    </div>
                  </div>
                </div>

                {/* Real-time upload progress display */}
                {uploadProgress && csvUploading && (
                  <div className="mb-4 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700 shadow-sm">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                          <div className="animate-spin text-xl">📤</div>
                        </div>
                        {uploadProgress.totalFiles > 0 && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                            {uploadProgress.currentFile}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                          Copying Files to Server
                        </div>
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          {uploadProgress.message || "Preparing files..."}
                        </div>
                      </div>
                    </div>

                    {/* Current file being processed */}
                    {uploadProgress.currentFileName && (
                      <div className="mb-4 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-100 dark:border-blue-800">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500">📁</span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                            {uploadProgress.currentFileName}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Progress bar */}
                    {uploadProgress.totalFiles > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-blue-800 dark:text-blue-200 font-medium">
                            Processing file {uploadProgress.currentFile} of{" "}
                            {uploadProgress.totalFiles}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400 font-bold">
                            {Math.round(
                              (uploadProgress.currentFile /
                                uploadProgress.totalFiles) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-3 dark:bg-blue-800 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-500 ease-out relative"
                            style={{
                              width: `${Math.min(
                                100,
                                (uploadProgress.currentFile /
                                  uploadProgress.totalFiles) *
                                  100
                              )}%`,
                            }}
                          >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Copy statistics */}
                    {uploadProgress.copyStats && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-green-100 dark:bg-green-900/40 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                            {uploadProgress.copyStats.videosCopied}
                          </div>
                          <div className="text-xs text-green-600 dark:text-green-400">
                            Videos Copied
                          </div>
                        </div>
                        <div className="bg-purple-100 dark:bg-purple-900/40 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                            {uploadProgress.copyStats.thumbnailsCopied}
                          </div>
                          <div className="text-xs text-purple-600 dark:text-purple-400">
                            Thumbnails
                          </div>
                        </div>
                        <div className="bg-yellow-100 dark:bg-yellow-900/40 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                            {uploadProgress.copyStats.videosSkipped}
                          </div>
                          <div className="text-xs text-yellow-600 dark:text-yellow-400">
                            Skipped
                          </div>
                        </div>
                        <div className="bg-red-100 dark:bg-red-900/40 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                            {uploadProgress.copyStats.errors.length}
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Errors
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error messages */}
                    {uploadProgress.copyStats &&
                      uploadProgress.copyStats.errors.length > 0 && (
                        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                          <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                            ⚠️ Errors encountered:
                          </div>
                          <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 max-h-20 overflow-y-auto">
                            {uploadProgress.copyStats.errors
                              .slice(0, 5)
                              .map((err, idx) => (
                                <li key={idx} className="truncate">
                                  • {err}
                                </li>
                              ))}
                            {uploadProgress.copyStats.errors.length > 5 && (
                              <li className="text-red-500">
                                ...and{" "}
                                {uploadProgress.copyStats.errors.length - 5}{" "}
                                more
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={csvUploading || !selectedCsvFile}
                  className={`btn-primary ${
                    csvUploading || !selectedCsvFile
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {csvUploading ? (
                    <span className="flex items-center gap-2">
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {uploadProgress && uploadProgress.totalFiles > 0
                        ? `Copying ${uploadProgress.currentFile}/${uploadProgress.totalFiles}...`
                        : "Starting upload..."}
                    </span>
                  ) : !selectedCsvFile ? (
                    "Please select a CSV file first"
                  ) : (
                    "Queue Upload Job"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Queue Status */}
        <div className="card">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📋</span>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                Upload Queue Status
              </h2>
            </div>
            <div className="flex gap-3 items-center w-full sm:w-auto flex-wrap">
              {queue.length > 0 && (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(
                          "/api/export-stats?format=json"
                        );
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `youtube-stats-${
                          new Date().toISOString().split("T")[0]
                        }.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                        setShowToast({
                          message: "Statistics exported!",
                          type: "success",
                        });
                      } catch (error) {
                        setShowToast({
                          message: "Failed to export statistics",
                          type: "error",
                        });
                      }
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    title="Export statistics as JSON"
                  >
                    📊 Export JSON
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/export-stats?format=csv");
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `youtube-stats-${
                          new Date().toISOString().split("T")[0]
                        }.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                        setShowToast({
                          message: "Statistics exported!",
                          type: "success",
                        });
                      } catch (error) {
                        setShowToast({
                          message: "Failed to export statistics",
                          type: "error",
                        });
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    title="Export statistics as CSV"
                  >
                    📊 Export CSV
                  </button>
                </>
              )}
              {queue.length > 0 && (
                <>
                  <input
                    type="text"
                    placeholder="Search jobs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field flex-1 sm:max-w-xs"
                  />
                  {queue.filter(
                    (job) =>
                      job.status === "completed" ||
                      job.status === "failed" ||
                      job.status === "cancelled"
                  ).length > 0 && (
                    <button
                      onClick={async () => {
                        const completedCount = queue.filter(
                          (job) =>
                            job.status === "completed" ||
                            job.status === "failed" ||
                            job.status === "cancelled"
                        ).length;
                        if (
                          confirm(
                            `Are you sure you want to delete all ${completedCount} completed/failed/cancelled job(s)? This action cannot be undone.`
                          )
                        ) {
                          try {
                            const res = await fetch("/api/queue-manage", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "delete-all" }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setShowToast({
                                message: data.message,
                                type: "success",
                              });
                              setSelectedJobId(null);
                              setJobStatus(null);
                              fetchQueue();
                            } else {
                              setShowToast({
                                message: data.error || "Failed to delete jobs",
                                type: "error",
                              });
                            }
                          } catch (error) {
                            setShowToast({
                              message: "An error occurred",
                              type: "error",
                            });
                          }
                        }
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                      title="Delete all completed/failed/cancelled jobs"
                    >
                      🗑️ Delete All Completed
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-gray-600 text-lg dark:text-gray-300">No upload jobs in queue.</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                Upload a CSV file to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quick Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {queue.length}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Total Jobs
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                    {pendingJobs}
                  </div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Pending
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                    {processing}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    Processing
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {completedJobs}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Completed
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {failedJobs}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Failed
                  </div>
                </div>
              </div>

              {/* Jobs List */}
              <div className="flex flex-col gap-4">
              {queue
                .filter(
                  (job) =>
                    !searchQuery ||
                    job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    job.status.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((job) => {
                  // Calculate job progress
                  const jobProgress = job.progress || [];
                  const completedCount = jobProgress.filter((p: any) =>
                    p.status.includes("Uploaded") || p.status.includes("Scheduled") || p.status.includes("Already uploaded")
                  ).length;
                  const failedCount = jobProgress.filter((p: any) =>
                    p.status.includes("Failed")
                  ).length;
                  const totalVideos = job.totalVideos || jobProgress.length || 0;
                  const progressPercent = totalVideos > 0 
                    ? Math.round((completedCount / totalVideos) * 100) 
                    : 0;
                  
                  return (
                  <div
                    key={job.id}
                    className={`p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                      selectedJobId === job.id
                        ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-blue-400 dark:border-blue-500 shadow-lg"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md"
                    }`}
                    onClick={() => {
                      setSelectedJobId(job.id);
                      // Immediately fetch job status and queue when clicked
                      fetchJobStatus(job.id);
                      fetchQueue();
                    }}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className={`w-4 h-4 rounded-full flex-shrink-0 ${
                              job.status === "completed"
                                ? "bg-green-500 shadow-lg shadow-green-500/50"
                                : job.status === "failed"
                                ? "bg-red-500 shadow-lg shadow-red-500/50"
                                : job.status === "processing"
                                ? "bg-yellow-500 animate-pulse shadow-lg shadow-yellow-500/50"
                                : job.status === "paused"
                                ? "bg-blue-500 shadow-lg shadow-blue-500/50"
                                : "bg-gray-400"
                            }`}
                          ></div>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                            {job.id}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                              job.status === "completed"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : job.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : job.status === "processing"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 animate-pulse"
                                : job.status === "paused"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {job.status === "completed" && "✓ "}
                            {job.status === "failed" && "✕ "}
                            {job.status === "processing" && "⚡ "}
                            {job.status === "paused" && "⏸ "}
                            {job.status.toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        {totalVideos > 0 && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Progress: {completedCount} / {totalVideos}
                              </span>
                              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                {progressPercent}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-300 ${
                                  job.status === "completed"
                                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                                    : job.status === "failed"
                                    ? "bg-gradient-to-r from-red-500 to-pink-500"
                                    : job.status === "processing"
                                    ? "bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse"
                                    : "bg-gradient-to-r from-blue-500 to-indigo-500"
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              ></div>
                            </div>
                            {(completedCount > 0 || failedCount > 0) && (
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {completedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    {completedCount} completed
                                  </span>
                                )}
                                {failedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    {failedCount} failed
                                  </span>
                                )}
                                {totalVideos - completedCount - failedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                    {totalVideos - completedCount - failedCount} pending
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 mb-2">
                          {job.totalVideos && (
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              📹 {job.totalVideos} video{job.totalVideos !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span>📅</span>
                            <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
                          </div>
                          {job.status === "pending" &&
                            (() => {
                              const ageSeconds =
                                (Date.now() -
                                  new Date(job.createdAt).getTime()) /
                                1000;
                              if (ageSeconds > 10) {
                                return (
                                  <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg">
                                    <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 font-semibold text-sm">
                                      <span>⚠️</span>
                                      <span>
                                        Waiting for worker... (
                                        {Math.round(ageSeconds)}s). Make sure
                                        worker is running:{" "}
                                        <code className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
                                          npm run worker
                                        </code>
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          {job.status === "processing" &&
                            job.progress &&
                            job.progress.length > 0 &&
                            job.progress[0] &&
                            (job.progress[0].status.includes("Uploading") ||
                            job.progress[0].status === "Pending" ? (
                              <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                                <div className="flex items-center gap-2 text-green-800 dark:text-green-200 font-semibold text-sm">
                                  <span className="animate-pulse-slow">⚡</span>
                                  <span>Uploading first video now...</span>
                                </div>
                              </div>
                            ) : null)}
                        </div>
                        {/* Queue Management Actions */}
                        <div className="flex gap-2 mt-4 flex-wrap pt-3 border-t border-gray-200 dark:border-gray-700">
                          {job.status === "pending" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "pause");
                                }}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ⏸ Pause
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {job.status === "paused" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "resume");
                                }}
                                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ▶ Resume
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {job.status === "processing" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "pause");
                                }}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ⏸ Pause
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {(job.status === "completed" ||
                            job.status === "failed" ||
                            job.status === "cancelled") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `Are you sure you want to delete this ${job.status} job? This will remove it from the queue and clean up associated files.`
                                  )
                                ) {
                                  handleQueueAction(job.id, "delete");
                                }
                              }}
                              className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              title="Delete this job"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-2xl text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {selectedJobId === job.id ? "▼" : "▶"}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedJobId &&
            jobStatus &&
            (() => {
              const progress = jobStatus.progress || [];
              const totalVideos = jobStatus.totalVideos || progress.length || 0;
              const completed = progress.filter(
                (p: ProgressItem) =>
                  p.status.includes("Uploaded") ||
                  p.status.includes("Scheduled") ||
                  p.status.includes("scheduled") ||
                  p.status.includes("Already uploaded")
              ).length;
              const failed = progress.filter(
                (p: ProgressItem) =>
                  p.status.includes("Failed") ||
                  p.status.includes("Missing") ||
                  p.status.includes("Invalid") ||
                  p.status.includes("not found") ||
                  p.status.includes("Cannot access") ||
                  p.status.includes("error")
              ).length;
              const processing = progress.filter(
                (p: ProgressItem) =>
                  p.status.includes("Uploading") ||
                  p.status === "Pending" ||
                  p.status.includes("thumbnail") ||
                  p.status.includes("Checking")
              ).length;
              const pending = totalVideos - completed - failed - processing;
              const progressPercentage =
                totalVideos > 0
                  ? Math.round((completed / totalVideos) * 100)
                  : 0;

              return (
                <div className="mt-5 p-6 bg-gradient-to-br from-gray-50 dark:from-gray-800 to-blue-50 dark:to-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-lg">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                        📋 Job Progress
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {jobStatus.id}
                      </p>
                      {jobStatus.notes && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded text-sm text-blue-800 dark:text-blue-200">
                          <strong>📝 Notes:</strong> {jobStatus.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const notes = prompt(
                            "Add notes for this job:",
                            jobStatus.notes || ""
                          );
                          if (notes !== null) {
                            try {
                              const res = await fetch("/api/queue-notes", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  jobId: jobStatus.id,
                                  notes,
                                }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setShowToast({
                                  message: "Notes updated",
                                  type: "success",
                                });
                                fetchJobStatus(jobStatus.id);
                              } else {
                                setShowToast({
                                  message:
                                    data.error || "Failed to update notes",
                                  type: "error",
                                });
                              }
                            } catch (error) {
                              setShowToast({
                                message: "An error occurred",
                                type: "error",
                              });
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        title="Add/edit notes"
                      >
                        📝 Notes
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              "Copy this job? This will create a duplicate with the same settings."
                            )
                          ) {
                            try {
                              const res = await fetch("/api/queue-copy", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ jobId: jobStatus.id }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setShowToast({
                                  message: `Job copied! New job ID: ${data.jobId}`,
                                  type: "success",
                                });
                                fetchQueue();
                                setSelectedJobId(data.jobId);
                                fetchJobStatus(data.jobId);
                              } else {
                                setShowToast({
                                  message: data.error || "Failed to copy job",
                                  type: "error",
                                });
                              }
                            } catch (error) {
                              setShowToast({
                                message: "An error occurred",
                                type: "error",
                              });
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        title="Copy this job"
                      >
                        📋 Copy
                      </button>
                      <button
                        onClick={() => setSelectedJobId(null)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Progress Statistics */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Overall Progress
                      </span>
                      <span className="text-lg font-bold text-gray-800 dark:text-white">
                        {progressPercentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                      <div
                        className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">
                          {totalVideos}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Total Videos
                        </div>
                      </div>
                      <div className="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {completed}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✅ Completed
                        </div>
                      </div>
                      <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-700">
                        <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                          {processing + pending}
                        </div>
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                          ⏳ Processing
                        </div>
                      </div>
                      <div className="text-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
                        <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                          {failed}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          ❌ Failed
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* First Video Upload Message */}
                  {progress.length > 0 &&
                    progress[0] &&
                    (progress[0].status.includes("Uploading") ||
                      progress[0].status === "Pending") &&
                    completed === 0 && (
                      <div className="mb-6 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg text-white animate-fade-in">
                        <div className="flex items-center gap-3">
                          <div className="text-3xl animate-pulse-slow">⚡</div>
                          <div>
                            <div className="font-bold text-lg mb-1">
                              Uploading First Video Now!
                            </div>
                            <div className="text-sm opacity-90">
                              The first video is being uploaded immediately.
                              Progress will update in real-time.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Video List */}
                  {progress.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Video Details ({completed}/{totalVideos} completed)
                      </h4>
                      <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                        {progress.map((item: any, idx: number) => {
                          const isSuccess =
                            item.status.includes("Uploaded") ||
                            item.status.includes("Scheduled") ||
                            item.status.includes("scheduled") ||
                            item.status.includes("Already uploaded");
                          const isFailed =
                            item.status.includes("Failed") ||
                            item.status.includes("Missing") ||
                            item.status.includes("Invalid") ||
                            item.status.includes("not found") ||
                            item.status.includes("Cannot access") ||
                            item.status.includes("error");
                          const isProcessing =
                            item.status.includes("Uploading") ||
                            item.status === "Pending" ||
                            item.status.includes("thumbnail") ||
                            item.status.includes("Checking");

                          // Format file size
                          const formatFileSize = (bytes?: number) => {
                            if (!bytes) return "N/A";
                            if (bytes < 1024) return `${bytes} B`;
                            if (bytes < 1024 * 1024)
                              return `${(bytes / 1024).toFixed(2)} KB`;
                            return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
                          };

                          // Format upload speed
                          const formatSpeed = (bytesPerSecond?: number) => {
                            if (!bytesPerSecond) return "";
                            if (bytesPerSecond < 1024)
                              return `${bytesPerSecond.toFixed(0)} B/s`;
                            if (bytesPerSecond < 1024 * 1024)
                              return `${(bytesPerSecond / 1024).toFixed(
                                2
                              )} KB/s`;
                            return `${(bytesPerSecond / 1024 / 1024).toFixed(
                              2
                            )} MB/s`;
                          };

                          // Format duration
                          const formatDuration = (seconds?: number) => {
                            if (!seconds) return "";
                            const hours = Math.floor(seconds / 3600);
                            const minutes = Math.floor((seconds % 3600) / 60);
                            const secs = Math.floor(seconds % 60);
                            if (hours > 0)
                              return `${hours}:${minutes
                                .toString()
                                .padStart(2, "0")}:${secs
                                .toString()
                                .padStart(2, "0")}`;
                            return `${minutes}:${secs
                              .toString()
                              .padStart(2, "0")}`;
                          };

                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg border transition-all ${
                                isSuccess
                                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                                  : isFailed
                                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                                  : isProcessing
                                  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700"
                                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="text-lg font-bold text-gray-800 dark:text-white flex-shrink-0">
                                    {isSuccess
                                      ? "✅"
                                      : isFailed
                                      ? "❌"
                                      : isProcessing
                                      ? "⏳"
                                      : "⏸️"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-gray-800 dark:text-white">
                                        Video {item.index + 1}
                                      </span>
                                      {item.videoId && (
                                        <a
                                          href={`https://www.youtube.com/watch?v=${item.videoId}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          🔗 View on YouTube
                                        </a>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                                      {item.fileSize && (
                                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                          📦 {formatFileSize(item.fileSize)}
                                        </span>
                                      )}
                                      {item.duration && (
                                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                          ⏱️ {formatDuration(item.duration)}
                                        </span>
                                      )}
                                      {item.uploadSpeed && (
                                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                                          ⚡ {formatSpeed(item.uploadSpeed)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 ${
                                    isSuccess
                                      ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200"
                                      : isFailed
                                      ? "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200"
                                      : isProcessing
                                      ? "bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 animate-pulse-slow"
                                      : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-5xl mb-3 animate-pulse-slow">⏳</div>
                      <p className="text-gray-600 dark:text-gray-400 font-medium">
                        Waiting for worker to start processing...
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        The first video will upload immediately once processing
                        begins
                      </p>
                      {jobStatus.status === "processing" && (
                        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
                            ⚡ Worker is processing - first video should start
                            uploading shortly...
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Uploaded Files Management */}
                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <span>📁</span>
                        <span>Uploaded Files on Server</span>
                      </h4>
                      {jobFiles &&
                        (jobFiles.files.videos.length > 0 ||
                          jobFiles.files.thumbnails.length > 0) && (
                          <button
                            onClick={() => handleDeleteAllFiles(selectedJobId!)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                          >
                            🗑️ Delete All Files
                          </button>
                        )}
                    </div>

                    {loadingFiles ? (
                      <div className="text-center py-4">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-800 dark:border-white"></div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          Loading files...
                        </p>
                      </div>
                    ) : jobFiles &&
                      (jobFiles.files.videos.length > 0 ||
                        jobFiles.files.thumbnails.length > 0 ||
                        jobFiles.files.csv) ? (
                      <div className="space-y-4">
                        {/* Total Size Info */}
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-blue-800 dark:text-blue-200 font-medium">
                              Total Storage: {jobFiles.totalSizeFormatted}
                            </span>
                            <span className="text-blue-600 dark:text-blue-400">
                              {jobFiles.totalFiles} file
                              {jobFiles.totalFiles !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>

                        {/* Video Files */}
                        {jobFiles.files.videos.length > 0 && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              📹 Video Files ({jobFiles.files.videos.length})
                            </h5>
                            <div className="space-y-2">
                              {jobFiles.files.videos.map(
                                (file: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                        {file.name}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {file.sizeFormatted}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleDeleteFile(
                                          selectedJobId!,
                                          file.path,
                                          file.name
                                        )
                                      }
                                      className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                      title={`Delete ${file.name}`}
                                    >
                                      🗑️ Delete
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Thumbnail Files */}
                        {jobFiles.files.thumbnails.length > 0 && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              🖼️ Thumbnail Files (
                              {jobFiles.files.thumbnails.length})
                            </h5>
                            <div className="space-y-2">
                              {jobFiles.files.thumbnails.map(
                                (file: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                        {file.name}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {file.sizeFormatted}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleDeleteFile(
                                          selectedJobId!,
                                          file.path,
                                          file.name
                                        )
                                      }
                                      className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                      title={`Delete ${file.name}`}
                                    >
                                      🗑️ Delete
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* CSV File */}
                        {jobFiles.files.csv && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              📄 CSV File
                            </h5>
                            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                  {jobFiles.files.csv.name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {jobFiles.files.csv.sizeFormatted}
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  handleDeleteFile(
                                    selectedJobId!,
                                    jobFiles.files.csv.path,
                                    jobFiles.files.csv.name
                                  )
                                }
                                className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title={`Delete ${jobFiles.files.csv.name}`}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="text-4xl mb-2">📭</div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          No files found on server for this job
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
        </div>

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
