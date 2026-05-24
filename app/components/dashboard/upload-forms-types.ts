import type { FormEvent, RefObject } from "react";

export interface UploadFormsProps {
  showSingleUpload: boolean;
  toggleSingleUpload: () => void;
  handleSingleUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  singleUploadClearKey?: number;
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
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;
  schedulingEnabled?: boolean;
  globalVideosPerDay?: string;
  openDropboxQueuePickerNonce?: number;
  openDriveQueuePickerNonce?: number;
}
