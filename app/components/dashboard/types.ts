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

/** Progress entry for one item in a bulk job */
export interface BulkJobProgressItem {
  index: number;
  status: string;
  videoId?: string;
  error?: string;
  title?: string;
}

/** Bulk queue job (matches lib/bulk-queue BulkUploadItem) */
export interface BulkJob {
  id: string;
  sessionId: string;
  userId?: string;
  type: "files" | "urls";
  videosPerDay?: number;
  startDate?: string;
  items: Array<Record<string, unknown>>;
  dropboxCsvPath?: string;
  dropboxSheetName?: string;
  status: "pending" | "processing" | "completed" | "failed" | "paused" | "cancelled";
  progress: BulkJobProgressItem[];
  createdAt: string;
  updatedAt: string;
  error?: string;
  /** Derived or API-provided total video count */
  totalVideos?: number;
  /** Optional notes (queue-notes) */
  notes?: string;
}

export type JobStatus = BulkJob | null;


