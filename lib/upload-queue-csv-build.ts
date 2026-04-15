import { isDriveFileId } from "@/lib/drive";
import { isValidUrl } from "@/lib/url-stream";
import type { CSVRow, VideoUploadTask } from "@/lib/upload-queue-types";

function normalizeFilename(filename: string): string {
  if (!filename) return "";
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractFilename(filePath: string): string {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop()?.toLowerCase() || "";
}

function findMatchingFile(
  csvFilename: string,
  fileMap: Map<string, File>,
): File | null {
  const lowerCsvFilename = csvFilename.toLowerCase();
  const normalizedCsvFilename = normalizeFilename(csvFilename);

  if (fileMap.has(lowerCsvFilename)) {
    return fileMap.get(lowerCsvFilename) || null;
  }

  if (fileMap.has(normalizedCsvFilename)) {
    return fileMap.get(normalizedCsvFilename) || null;
  }

  for (const [uploadedFilename, file] of Array.from(fileMap.entries())) {
    const normalizedUploaded = normalizeFilename(uploadedFilename);
    const csvCore = normalizedCsvFilename.replace(/\.(mp4|mov|avi|mkv)$/i, "");
    const uploadedCore = normalizedUploaded.replace(
      /\.(mp4|mov|avi|mkv)$/i,
      "",
    );

    if (
      csvCore === uploadedCore ||
      (csvCore.length > 10 && uploadedCore.includes(csvCore)) ||
      (uploadedCore.length > 10 && csvCore.includes(uploadedCore))
    ) {
      return file || null;
    }
  }

  return null;
}

function buildFileMaps(uploadedFiles: File[], uploadedThumbnails: File[]) {
  const uploadedFilesMap = new Map<string, File>();
  uploadedFiles.forEach((file) => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedFilesMap.set(filename, file);
    if (normalized !== filename) {
      uploadedFilesMap.set(normalized, file);
    }
  });

  const uploadedThumbnailsMap = new Map<string, File>();
  uploadedThumbnails.forEach((file) => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedThumbnailsMap.set(filename, file);
    if (normalized !== filename) {
      uploadedThumbnailsMap.set(normalized, file);
    }
  });

  return { uploadedFilesMap, uploadedThumbnailsMap };
}

/**
 * Build per-row upload tasks from parsed CSV/XLSX and locally uploaded asset files.
 */
export function buildVideoUploadTasksFromCsv(
  csvData: CSVRow[],
  uploadedFiles: File[],
  uploadedThumbnails: File[],
): VideoUploadTask[] {
  const { uploadedFilesMap, uploadedThumbnailsMap } = buildFileMaps(
    uploadedFiles,
    uploadedThumbnails,
  );

  const tasks: VideoUploadTask[] = [];
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];

    let videoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let driveFileId: string | undefined;
    let driveThumbnailId: string | undefined;

    if (row.drive_file_id && isDriveFileId(row.drive_file_id)) {
      driveFileId = row.drive_file_id;
    } else if (row.path && isDriveFileId(row.path)) {
      driveFileId = row.path;
    }

    if (!driveFileId) {
      if (row.video_url && isValidUrl(row.video_url)) {
        videoUrl = row.video_url;
      } else if (row.path && isValidUrl(row.path)) {
        videoUrl = row.path;
      }
    }

    if (row.drive_thumbnail_id && isDriveFileId(row.drive_thumbnail_id)) {
      driveThumbnailId = row.drive_thumbnail_id;
    } else if (row.thumbnail_path && isDriveFileId(row.thumbnail_path)) {
      driveThumbnailId = row.thumbnail_path;
    }

    if (!driveThumbnailId) {
      if (row.thumbnail_url && isValidUrl(row.thumbnail_url)) {
        thumbnailUrl = row.thumbnail_url;
      } else if (row.thumbnail_path && isValidUrl(row.thumbnail_path)) {
        thumbnailUrl = row.thumbnail_path;
      }
    }

    let authHeaders: Record<string, string> | undefined;
    if (row.url_auth_headers) {
      try {
        authHeaders = JSON.parse(row.url_auth_headers);
      } catch (e) {
        console.warn(`Failed to parse auth headers for row ${i}:`, e);
      }
    }

    const timeout = row.url_timeout ? parseInt(row.url_timeout, 10) : undefined;

    let videoFile: File | null = null;
    let thumbnailFile: File | null = null;

    if (!videoUrl) {
      const csvVideoFilename = row.video_name
        ? row.video_name.toLowerCase().trim()
        : row.path
          ? extractFilename(row.path)
          : "";

      const csvThumbFilename = row.thumbnail_name
        ? row.thumbnail_name.toLowerCase().trim()
        : row.thumbnail_path
          ? extractFilename(row.thumbnail_path)
          : "";

      videoFile = csvVideoFilename
        ? findMatchingFile(csvVideoFilename, uploadedFilesMap)
        : null;
      thumbnailFile = csvThumbFilename
        ? findMatchingFile(csvThumbFilename, uploadedThumbnailsMap)
        : null;
    }

    tasks.push({
      index: i,
      row,
      videoFile,
      thumbnailFile,
      videoUrl,
      thumbnailUrl,
      driveFileId,
      driveThumbnailId,
      authHeaders,
      timeout,
      postUploadAction: row.post_upload_action || "none",
      completedFolderId: row.completed_folder_id,
    });
  }

  return tasks;
}

export function filterValidUploadTasks(tasks: VideoUploadTask[]): {
  validTasks: VideoUploadTask[];
  invalidCount: number;
} {
  const validTasks = tasks.filter(
    (t) =>
      t.videoFile !== null ||
      t.videoUrl !== undefined ||
      t.driveFileId !== undefined,
  );
  return {
    validTasks,
    invalidCount: tasks.length - validTasks.length,
  };
}
