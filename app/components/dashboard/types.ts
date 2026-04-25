export interface User {
  authenticated: boolean;
  name: string;
  picture: string;
}

export interface Message {
  type: "success" | "error" | "info" | null;
  text: string | null;
}

export interface ProgressItem {
  index: number;
  status: string;
}

export interface BulkUploadProgress {
  total: number;
  totalBatches: number;
  currentBatch: number;
  completed: number;
  failed: number;
  currentFile?: string;
  message?: string;
}

export interface MetadataUpdateProgress {
  total: number;
  updated: number;
  failed: number;
  thumbnails: number;
  currentVideo?: string;
  message?: string;
  currentBatch?: number;
  totalBatches?: number;
  rate?: number;
  estimatedSeconds?: number;
  processed?: number;
  failedVideos?: Array<{ videoName: string; error: string; index: number }>;
  totalTime?: number;
  avgRate?: number;
}

export interface ZipUploadProgress {
  progress: number;
  message: string;
  totalFiles?: number;
  extractedCount?: number;
  videoCount?: number;
  thumbnailCount?: number;
}

export interface UploadProgress {
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
}

import type { BulkUploadItem } from "@/lib/bulk-queue";

/** Progress entry for one item in a bulk job (shared with lib/bulk-queue) */
export type BulkJobProgressItem = BulkUploadItem["progress"][number];

/** Bulk queue job - extends server BulkUploadItem with API response fields */
export interface BulkJob
  extends Pick<
    BulkUploadItem,
    | "id"
    | "sessionId"
    | "userId"
    | "type"
    | "videosPerDay"
    | "startDate"
    | "items"
    | "dropboxCsvPath"
    | "dropboxSheetName"
    | "status"
    | "progress"
    | "createdAt"
    | "updatedAt"
    | "error"
  > {
  /** Derived or API-provided total video count */
  totalVideos?: number;
  /** Optional notes (queue-notes) */
  notes?: string;
  /** Number of jobs ahead in the worker queue (0 = next to run) */
  positionAhead?: number;
}

export type JobStatus = BulkJob | null;

/** Response shape from GET /api/python-queue (dashboard) */
export interface PythonQueueData {
  enabled: boolean;
  queueRootLabel?: string;
  maxPerTick: number;
  skipDuplicateTitles: boolean;
  sessionIdEnvConfigured: boolean;
  pending: Array<{
    id: string;
    title: string;
    priority: number;
    locked: boolean;
    videoReady: boolean;
    fileName: string;
    videoType?: string;
    isShort?: boolean;
  }>;
  failedCount: number;
  processedCount: number;
  uploadsTodayUtc: number;
  /** Shorts uploaded today (UTC) */
  shortsUploadedTodayUtc?: number;
  /** Video type breakdown (short, review, etc.) for today's uploads */
  videoTypeBreakdownTodayUtc?: Record<string, number>;
  /** Where pending manifests are read from for this session */
  source?: "filesystem" | "dropbox" | "both";
  /** Session has persisted Dropbox python-queue root */
  dropboxConfigured?: boolean;
  /** Resolved Dropbox queue root (same user only) */
  dropboxRootPath?: string;
  /** UTC daily cap for Python manifest uploads when dashboard scheduling is enabled */
  manifestDailyLimit?: {
    enabled: boolean;
    videosPerDay: number;
    uploadsTodayUtc: number;
    remainingToday: number;
  } | null;
}


