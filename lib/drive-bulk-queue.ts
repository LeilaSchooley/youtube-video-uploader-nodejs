import type { BulkUploadItem } from "@/lib/bulk-queue";
import {
  buildCsvMetadataMap,
  getVideoNameFromRow,
  matchCsvMetadata,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-buffer-parse";
import {
  sanitizeYoutubeDescription,
  sanitizeYoutubeTitle,
} from "@/lib/youtube-utils";

export type DriveVideo = {
  id: string;
  name: string;
};

type QueueItem = BulkUploadItem["items"][number];

function parseMadeForKids(row: SpreadsheetRow | undefined): boolean | undefined {
  if (!row) return undefined;
  const raw =
    row.made_for_kids ?? row.madeforkids ?? row.selfDeclaredMadeForKids;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).toLowerCase().trim();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return undefined;
}

export type BuildDriveBulkQueueResult =
  | {
      ok: true;
      queueItems: QueueItem[];
      matchedCount: number;
      unmatchedCount: number;
      unmatchedVideos: string[];
      hasCsvMetadata: boolean;
    }
  | { ok: false; error: string; status: number; details?: Record<string, unknown> };

export function buildDriveBulkQueueItems(opts: {
  videos: DriveVideo[];
  csvRows: SpreadsheetRow[];
  videoNameColumn: string | null;
  thumbnailsMap: Map<string, string>;
  privacyStatus: "public" | "private" | "unlisted";
  postUploadAction: string;
  completedFolderId?: string;
  logPrefix?: string;
}): BuildDriveBulkQueueResult {
  const {
    videos,
    csvRows,
    thumbnailsMap,
    privacyStatus,
    postUploadAction,
    completedFolderId,
    logPrefix = "[UPLOAD-DRIVE]",
  } = opts;

  const csvMetadataMap = buildCsvMetadataMap(csvRows);
  const hasCsvMetadata = csvRows.length > 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  const unmatchedVideos: string[] = [];

  const buildItemFromCsvRow = (video: DriveVideo, csvMetadata: SpreadsheetRow) => {
    const videoName = video.name.toLowerCase();
    const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
    const publishDate =
      (csvMetadata?.publishAt as string) ||
      (csvMetadata?.publishat as string) ||
      (csvMetadata?.scheduleTime as string) ||
      (csvMetadata?.scheduletime as string) ||
      undefined;

    let driveThumbnailId: string | undefined;
    const csvThumbPath = String(csvMetadata?.thumbnail_path ?? "").trim();
    const csvThumbName = String(csvMetadata?.thumbnail_name ?? "").trim();
    if (csvThumbPath && /^[a-zA-Z0-9_-]{20,}$/.test(csvThumbPath)) {
      driveThumbnailId = csvThumbPath;
    } else if (csvThumbName || csvThumbPath) {
      const thumbFilename =
        csvThumbName || csvThumbPath.split(/[/\\]/).pop() || "";
      const thumbNameWoExt = thumbFilename
        .toLowerCase()
        .replace(/\.[^/.]+$/, "");
      driveThumbnailId =
        thumbnailsMap.get(thumbNameWoExt) ||
        thumbnailsMap.get(nameWithoutExt);
    } else {
      driveThumbnailId = thumbnailsMap.get(nameWithoutExt);
    }

    const rawTitle =
      String(csvMetadata?.youtube_title ?? "") ||
      video.name.replace(/\.[^/.]+$/, "");
    const rawDesc =
      String(csvMetadata?.youtube_description ?? "") ||
      `Uploaded from Google Drive: ${video.name}`;

    return {
      title: sanitizeYoutubeTitle(rawTitle),
      video_name: video.name,
      description: sanitizeYoutubeDescription(rawDesc),
      privacyStatus: (String(
        csvMetadata?.privacyStatus ??
          csvMetadata?.privacystatus ??
          privacyStatus,
      ) || privacyStatus) as "public" | "private" | "unlisted",
      driveFileId: video.id,
      postUploadAction:
        String(
          csvMetadata?.post_upload_action ??
            csvMetadata?.postuploadaction ??
            "",
        ) || (postUploadAction !== "none" ? postUploadAction : undefined),
      completedFolderId:
        String(
          csvMetadata?.completed_folder_id ??
            csvMetadata?.completedfolderid ??
            "",
        ) ||
        completedFolderId ||
        undefined,
      publishDate,
      thumbnailUrl: csvMetadata?.thumbnail_url
        ? String(csvMetadata.thumbnail_url)
        : undefined,
      driveThumbnailId,
      madeForKids: parseMadeForKids(csvMetadata),
    } satisfies QueueItem;
  };

  let queueItems: QueueItem[];

  if (hasCsvMetadata && csvRows.length > 0) {
    queueItems = [];
    const videosByName = new Map<string, DriveVideo>();
    for (const v of videos) {
      const lower = v.name.toLowerCase().trim();
      const lowerNoExt = lower.replace(/\.[^/.]+$/, "");
      if (!videosByName.has(lower)) videosByName.set(lower, v);
      if (!videosByName.has(lowerNoExt)) videosByName.set(lowerNoExt, v);
    }

    for (const row of csvRows) {
      const rawVideoName = getVideoNameFromRow(row);
      if (!rawVideoName) continue;
      const videoName = rawVideoName.toLowerCase().trim();
      const videoNameNoExt = videoName.replace(/\.[^/.]+$/, "");
      const video =
        videosByName.get(videoName) ||
        videosByName.get(videoNameNoExt) ||
        videos.find((v) => {
          const vn = v.name.toLowerCase();
          return vn.includes(videoName) || videoName.includes(vn);
        });
      if (!video) {
        unmatchedCount++;
        unmatchedVideos.push(rawVideoName);
        continue;
      }
      matchedCount++;
      queueItems.push(buildItemFromCsvRow(video, row));
    }

    if (matchedCount === 0) {
      return {
        ok: false,
        status: 400,
        error: `No videos matched CSV entries. Found ${videos.length} videos in folder, but none matched the ${csvRows.length} entries in the spreadsheet.`,
        details: {
          totalVideos: videos.length,
          csvEntries: csvRows.length,
          videoNameColumn: opts.videoNameColumn,
        },
      };
    }
  } else {
    queueItems = videos.map((video) => {
      const videoName = video.name.toLowerCase();
      const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
      const csvMetadata = matchCsvMetadata(csvMetadataMap, videoName);
      if (csvMetadata) {
        matchedCount++;
        return buildItemFromCsvRow(video, csvMetadata);
      }
      return {
        title: sanitizeYoutubeTitle(video.name.replace(/\.[^/.]+$/, "")),
        video_name: video.name,
        description: sanitizeYoutubeDescription(
          `Uploaded from Google Drive: ${video.name}`,
        ),
        privacyStatus,
        driveFileId: video.id,
        driveThumbnailId: thumbnailsMap.get(nameWithoutExt),
        postUploadAction:
          postUploadAction !== "none" ? postUploadAction : undefined,
        completedFolderId,
      } satisfies QueueItem;
    });
    console.log(
      `${logPrefix} Folder-driven queue: ${queueItems.length} video(s)`,
    );
  }

  return {
    ok: true,
    queueItems,
    matchedCount,
    unmatchedCount,
    unmatchedVideos,
    hasCsvMetadata,
  };
}
