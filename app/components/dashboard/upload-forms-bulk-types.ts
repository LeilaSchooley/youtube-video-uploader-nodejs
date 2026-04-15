import type { FormEvent, MutableRefObject } from "react";

export type PythonQueueDetectInfo = {
  manifestCount: number;
  videoCount: number;
  thumbnailCount: number;
  resolvedRoot: string;
};

export type BulkUploadProgressState = {
  total: number;
  totalBatches: number;
  currentBatch: number;
  completed: number;
  failed: number;
  currentFile?: string;
  message?: string;
} | null;

export interface UploadFormsBulkSectionProps {
  showBulkUpload: boolean;
  setShowBulkUpload: (show: boolean) => void;
  handleBulkUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  uploadSource: "drive" | "dropbox";
  setUploadSource: (source: "drive" | "dropbox") => void;
  driveUploadFolderId: string;
  setDriveUploadFolderId: (id: string) => void;
  setDriveUploadFolderName: (name: string) => void;
  setDriveBrowserContext: (ctx: "drive" | "sheets") => void;
  setShowDriveBrowser: (show: boolean) => void;
  setShowSheetsBrowser: (show: boolean) => void;
  dropboxPythonQueueMode: boolean;
  pythonQueueDetectInfo: PythonQueueDetectInfo | null;
  dropboxUploadFolderPath: string;
  setDropboxUploadFolderPath: (path: string) => void;
  setDropboxBrowserMode: (mode: "folder" | "file") => void;
  setDropboxBrowserContext: (
    ctx: "bulk" | "sheets-folder" | "sheets-file" | "thumbnails-folder",
  ) => void;
  setShowDropboxBrowser: (show: boolean) => void;
  clearDropboxPythonQueueMode: () => Promise<void>;
  skipDuplicateTitles: boolean;
  setSkipDuplicateTitles: (v: boolean) => void;
  dropboxThumbnailsFolderPath: string;
  setDropboxThumbnailsFolderPath: (path: string) => void;
  selectedDropboxCsvFile: string;
  setSelectedDropboxCsvFile: (path: string) => void;
  dropboxSheetNames: Array<{ title: string; sheetId: number }>;
  setDropboxSheetNames: (
    sheets: Array<{ title: string; sheetId: number }>,
  ) => void;
  loadingDropboxSheets: boolean;
  selectedDropboxSheetName: string;
  setSelectedDropboxSheetName: (name: string) => void;
  dropboxUploading: boolean;
  setDropboxUploading: (v: boolean) => void;
  schedulingEnabled: boolean;
  globalVideosPerDay: string;
  checkDuplicatesBeforeUpload: boolean;
  setCheckDuplicatesBeforeUpload: (v: boolean) => void;
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;
  bulkUploadProgress: BulkUploadProgressState;
  bulkUploading: boolean;
  selectedBulkFiles: File[];
  bulkUrls: string[];
  debounceTimerRef: MutableRefObject<NodeJS.Timeout | null>;
  fetchSheets: (spreadsheetUrl: string) => Promise<void>;
  availableSheets: Array<{ title: string; sheetId: number }>;
  setAvailableSheets: (
    sheets: Array<{ title: string; sheetId: number }>,
  ) => void;
  loadingSheets: boolean;
  spreadsheetTitle: string;
  setSpreadsheetTitle: (title: string) => void;
}
