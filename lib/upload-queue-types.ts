export interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  video_name?: string;
  thumbnail_name?: string;
  thumbnail_path?: string;
  path?: string;
  video_url?: string;
  thumbnail_url?: string;
  drive_file_id?: string;
  drive_thumbnail_id?: string;
  url_auth_headers?: string;
  url_timeout?: string;
  scheduleTime?: string;
  privacyStatus?: string;
  post_upload_action?: string;
  completed_folder_id?: string;
}

export interface VideoUploadTask {
  index: number;
  row: CSVRow;
  videoFile: File | null;
  thumbnailFile: File | null;
  videoUrl?: string;
  thumbnailUrl?: string;
  driveFileId?: string;
  driveThumbnailId?: string;
  authHeaders?: Record<string, string>;
  timeout?: number;
  postUploadAction?: string;
  completedFolderId?: string;
}

export interface BatchProgress {
  batchNumber: number;
  totalBatches: number;
  batchSize: number;
  completed: number;
  failed: number;
  total: number;
  currentBatch: Array<{
    index: number;
    title: string;
    status: "uploading" | "success" | "failed";
    videoId?: string;
    error?: string;
  }>;
}
