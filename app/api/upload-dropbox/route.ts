import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient, getDropboxToken } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import {
  listDropboxVideosRecursive,
  listDropboxVideos,
  downloadDropboxFile,
  listDropboxItems,
} from "@/lib/dropbox";
import { addToBulkQueue } from "@/lib/bulk-queue";
import { Readable } from "stream";
import { getUploadedTitlesSet } from "@/lib/uploaded-videos";
import { jsonApiError } from "@/lib/api-response";
import {
  sanitizeYoutubeTitle,
  sanitizeYoutubeDescription,
} from "@/lib/youtube-utils";
const csvParser = require("csv-parser");
// Use require for xlsx to avoid TypeScript module resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require("xlsx") as typeof import("xlsx");

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/upload-dropbox
 * Upload videos from a Dropbox folder
 *
 * Body:
 * - dropboxFolderPath: string (required) - Dropbox folder path (e.g., "/Videos")
 * - recursive: boolean (optional) - Scan subfolders (default: false)
 * - postUploadAction: "rename" | "delete" | "move" | "none" (optional, default: "none")
 * - completedFolderPath: string (optional) - Required if postUploadAction is "move"
 * - privacyStatus: "public" | "private" | "unlisted" (optional, default: "public")
 * - videosPerDay: number (optional) - Number of videos to upload per day for scheduling
 * - dropboxCsvPath: string (optional) - Path to CSV/XLSX file in Dropbox for metadata matching
 * - dropboxSheetName: string (optional) - Sheet name for XLSX (default: first sheet)
 * - dropboxThumbnailsFolderPath: string (optional) - Folder with thumbnail images; matched by filename without extension
 * - useWorker: boolean (optional, default: true)
 * - skipDuplicateTitles: boolean (optional, default: true) - If true, filter out rows whose title already exists on YouTube channel before scheduling
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    // Ensure userId is set on session (for display/queue). Skip if userinfo scope not granted or token invalid.
    if (!session.userId) {
      try {
        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);
        const oauth2 = google.oauth2({
          version: "v2",
          auth: oAuthClient,
        });
        const userInfo = await oauth2.userinfo.get();
        session.userId = (userInfo.data.email ||
          userInfo.data.id ||
          undefined) as string;
        if (session.userId) setSession(sessionId, session);
      } catch (err) {
        console.warn(
          "[UPLOAD-DROPBOX] Could not fetch Google userinfo (missing scope or expired token). Proceeding without userId.",
          err,
        );
      }
    }

    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
    );
    if (!dropboxToken) {
      return NextResponse.json(
        { error: "Dropbox not connected. Please connect Dropbox first." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      dropboxFolderPath,
      recursive = false,
      postUploadAction = "none",
      completedFolderPath,
      privacyStatus = "public",
      videosPerDay,
      useWorker = true,
      dropboxCsvPath, // Optional CSV file path from Dropbox for metadata
      dropboxSheetName, // Optional sheet name for XLSX
      dropboxThumbnailsFolderPath, // Optional folder with thumbnail images
      skipDuplicateTitles = true, // If true, filter out rows whose title already exists on channel
    } = body;

    if (!dropboxFolderPath) {
      return NextResponse.json(
        { error: "dropboxFolderPath is required" },
        { status: 400 },
      );
    }

    // Ensure path starts with /
    const normalizedPath = dropboxFolderPath.startsWith("/")
      ? dropboxFolderPath
      : `/${dropboxFolderPath}`;

    if (postUploadAction === "move" && !completedFolderPath) {
      return NextResponse.json(
        {
          error:
            "completedFolderPath is required when postUploadAction is 'move'",
        },
        { status: 400 },
      );
    }

    console.log(`[UPLOAD-DROPBOX] Scanning folder: ${normalizedPath}`);

    // List videos in folder
    let videos;
    let currentDropboxToken = dropboxToken; // Track token in case it gets refreshed
    try {
      if (recursive) {
        videos = await listDropboxVideosRecursive(
          normalizedPath,
          dropboxToken,
          10,
          sessionId,
          session.dropboxRefreshToken,
        );
      } else {
        videos = await listDropboxVideos(
          normalizedPath,
          dropboxToken,
          sessionId,
          session.dropboxRefreshToken,
        );
      }
      // Re-fetch token in case it was refreshed during listing
      const refreshedSession = getSession(sessionId);
      if (
        refreshedSession?.dropboxToken &&
        refreshedSession.dropboxToken !== dropboxToken
      ) {
        currentDropboxToken = refreshedSession.dropboxToken;
        console.log(
          `[UPLOAD-DROPBOX] Token was refreshed during listing, using updated token`,
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Failed to list videos: ${error?.message || "Unknown error"}`,
        },
        { status: 500 },
      );
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: "No video files found in the specified Dropbox folder" },
        { status: 400 },
      );
    }

    // Parse CSV/XLSX metadata if provided
    let csvMetadataMap: Map<string, any> = new Map();
    let csvData: any[] = [];
    // Auto-detect column that holds the video filename
    // Populated after CSV is parsed; used by getVideoNameFromRow and the queue builder
    let videoNameColumn: string | null = null;
    const KNOWN_VIDEO_NAME_COLUMNS = [
      "video_name",
      "videoname",
      "video name",
      "filename",
      "file_name",
      "file name",
      "name",
      "video",
      "file",
    ];
    const getVideoNameFromRow = (row: any): string | undefined => {
      if (videoNameColumn && row[videoNameColumn] !== undefined) {
        const s =
          typeof row[videoNameColumn] === "string"
            ? row[videoNameColumn].trim()
            : String(row[videoNameColumn] ?? "").trim();
        return s || undefined;
      }
      // Fallback: try known names
      for (const col of KNOWN_VIDEO_NAME_COLUMNS) {
        if (row[col] !== undefined) {
          const s =
            typeof row[col] === "string"
              ? row[col].trim()
              : String(row[col] ?? "").trim();
          return s || undefined;
        }
      }
      return undefined;
    };
    if (dropboxCsvPath) {
      try {
        console.log(
          `[UPLOAD-DROPBOX] Downloading spreadsheet from: ${dropboxCsvPath}`,
        );
        const fileStream = await downloadDropboxFile(
          dropboxCsvPath,
          currentDropboxToken,
          sessionId,
          session.dropboxRefreshToken,
        );

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
          chunks.push(Buffer.from(chunk));
        }
        const fileBuffer = Buffer.concat(chunks);

        // Check file extension to determine parser
        const fileExtension = dropboxCsvPath.toLowerCase().split(".").pop();

        if (fileExtension === "xlsx" || fileExtension === "xls") {
          // Parse XLSX/XLS file
          const workbook = XLSX.read(fileBuffer, { type: "buffer" });
          const sheetNameToUse =
            dropboxSheetName && workbook.SheetNames.includes(dropboxSheetName)
              ? dropboxSheetName
              : workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetNameToUse];
          csvData = XLSX.utils.sheet_to_json(worksheet);
          console.log(
            `[UPLOAD-DROPBOX] Parsed ${csvData.length} rows from XLSX/XLS`,
          );
        } else {
          // Parse CSV file
          await new Promise<void>((resolve, reject) => {
            Readable.from(fileBuffer)
              .pipe(csvParser())
              .on("data", (row: any) => {
                csvData.push(row);
              })
              .on("end", () => {
                console.log(
                  `[UPLOAD-DROPBOX] Parsed ${csvData.length} rows from CSV`,
                );
                resolve();
              })
              .on("error", (err: any) => {
                reject(new Error(`Failed to parse CSV: ${err.message}`));
              });
          });
        }

        // Log CSV structure so we can debug column names
        if (csvData.length > 0) {
          const firstRow = csvData[0] as Record<string, unknown>;
          const columnNames = Object.keys(firstRow);
          console.log(
            `[UPLOAD-DROPBOX] CSV columns (${columnNames.length}): ${columnNames.join(", ")}`,
          );
          const sampleValues = columnNames
            .slice(0, 8)
            .map((k) => `${k}=${JSON.stringify(firstRow[k]).slice(0, 50)}`)
            .join("; ");
          console.log(`[UPLOAD-DROPBOX] First row sample: ${sampleValues}`);

          // Auto-detect the video name column (case-insensitive match against known names)
          for (const col of columnNames) {
            const lower = col.toLowerCase().trim();
            if (KNOWN_VIDEO_NAME_COLUMNS.includes(lower)) {
              videoNameColumn = col;
              break;
            }
          }
          if (!videoNameColumn) {
            // Fallback: look for any column whose name contains "video" or "file" or "name"
            for (const col of columnNames) {
              const lower = col.toLowerCase().trim();
              if (
                lower.includes("video") ||
                lower.includes("file") ||
                lower === "name"
              ) {
                videoNameColumn = col;
                break;
              }
            }
          }
          console.log(
            `[UPLOAD-DROPBOX] Auto-detected video name column: "${videoNameColumn || "(none)"}" from columns: [${columnNames.join(", ")}]`,
          );
        }

        // Create map of video_name -> CSV row metadata
        csvData.forEach((row) => {
          const videoName = getVideoNameFromRow(row)?.toLowerCase();
          if (videoName) {
            csvMetadataMap.set(videoName, row);
          }
        });

        const rowsWithName = csvData.filter(
          (r) => getVideoNameFromRow(r),
        ).length;
        console.log(
          `[UPLOAD-DROPBOX] Created metadata map with ${csvMetadataMap.size} entries (${rowsWithName}/${csvData.length} rows had a video name)`,
        );
        if (csvMetadataMap.size > 0) {
          const sampleKeys = Array.from(csvMetadataMap.keys()).slice(0, 5);
          console.log(
            `[UPLOAD-DROPBOX] Sample metadata keys: ${sampleKeys.join(", ")}`,
          );
        }
        if (csvMetadataMap.size === 0 && csvData.length > 0) {
          console.warn(
            `[UPLOAD-DROPBOX] WARNING: 0 entries in metadata map despite ${csvData.length} CSV rows. Column "${videoNameColumn || "(none)"}" did not yield any values. Check CSV columns above.`,
          );
        }
      } catch (error: any) {
        console.error(`[UPLOAD-DROPBOX] Error parsing spreadsheet:`, error);
        return NextResponse.json(
          {
            error: `Failed to parse spreadsheet file: ${error?.message || "Unknown error"}`,
          },
          { status: 400 },
        );
      }
    }

    // Helper function to match video_name to Dropbox file
    const matchCsvMetadata = (videoName: string): any | undefined => {
      if (!videoName || csvMetadataMap.size === 0) {
        return undefined;
      }

      const normalizedName = videoName.toLowerCase().trim();
      const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, "");

      // Try exact match first (with extension)
      if (csvMetadataMap.has(normalizedName)) {
        return csvMetadataMap.get(normalizedName);
      }

      // Try match without extension
      if (csvMetadataMap.has(nameWithoutExt)) {
        return csvMetadataMap.get(nameWithoutExt);
      }

      // Try partial match
      for (const [csvVideoName, metadata] of Array.from(
        csvMetadataMap.entries(),
      )) {
        if (
          csvVideoName.includes(normalizedName) ||
          normalizedName.includes(csvVideoName)
        ) {
          return metadata;
        }
      }

      return undefined;
    };

    // Build thumbnails map from optional thumbnails folder (name without ext -> Dropbox path)
    let thumbnailsMap = new Map<string, string>();
    if (dropboxThumbnailsFolderPath && dropboxThumbnailsFolderPath.trim()) {
      const normalizedThumbPath = dropboxThumbnailsFolderPath.startsWith("/")
        ? dropboxThumbnailsFolderPath.trim()
        : `/${dropboxThumbnailsFolderPath.trim()}`;
      try {
        const thumbItems = await listDropboxItems(
          normalizedThumbPath,
          dropboxToken,
          sessionId,
          session.dropboxRefreshToken,
        );
        const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
        for (const item of thumbItems) {
          if (item.type === "file" && item.name) {
            const ext = item.name
              .toLowerCase()
              .slice(item.name.lastIndexOf("."));
            if (imageExts.includes(ext)) {
              const nameWoExt = item.name
                .toLowerCase()
                .replace(/\.[^/.]+$/, "");
              thumbnailsMap.set(nameWoExt, item.id);
            }
          }
        }
        const sampleKeys = Array.from(thumbnailsMap.keys()).slice(0, 10);
        console.log(
          `[UPLOAD-DROPBOX] Thumbnails folder "${normalizedThumbPath}": ${thumbnailsMap.size} image(s) found. Sample keys (name without ext): ${sampleKeys.join(", ") || "(none)"}${thumbnailsMap.size > 10 ? " ..." : ""}`,
        );
      } catch (thumbErr: any) {
        console.warn(
          `[UPLOAD-DROPBOX] Thumbnails folder list failed: ${thumbErr?.message}. Continuing without thumbnails.`,
        );
      }
    }

    // If useWorker, queue for background processing
    if (useWorker) {
      let matchedCount = 0;
      let unmatchedCount = 0;
      const unmatchedVideos: string[] = [];

      // If a CSV was provided and parsed, use CSV-driven queueing (total/pending = CSV length).
      // hasCsvMetadata is true when we have a CSV file, even if the metadata map is empty
      // (an empty map means no video_name column was found; we still don't want folder-driven).
      const hasCsvMetadata = csvData.length > 0;

      const buildItemFromCsvRow = (
        video: (typeof videos)[0],
        csvMetadata: any,
      ) => {
        const videoName = video.name.toLowerCase();
        const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
        const publishDate =
          csvMetadata?.publishAt ||
          csvMetadata?.publishat ||
          csvMetadata?.scheduleTime ||
          csvMetadata?.scheduletime ||
          undefined;
        let dropboxThumbnailId: string | undefined;
        let thumbnailSource: string = "";
        const csvThumbPath = (csvMetadata?.thumbnail_path ?? "")
          .toString()
          .trim();
        const csvThumbName = (csvMetadata?.thumbnail_name ?? "")
          .toString()
          .trim();
        if (csvThumbPath.startsWith("/")) {
          dropboxThumbnailId = csvThumbPath;
          thumbnailSource = "csv_full_path";
        } else if (csvThumbName || csvThumbPath) {
          const thumbFilename =
            csvThumbName || csvThumbPath.split(/[/\\]/).pop() || "";
          const thumbNameWoExt = thumbFilename
            .toLowerCase()
            .replace(/\.[^/.]+$/, "");
          dropboxThumbnailId =
            thumbnailsMap.get(thumbNameWoExt) ||
            thumbnailsMap.get(nameWithoutExt) ||
            undefined;
          thumbnailSource = dropboxThumbnailId
            ? thumbnailsMap.has(thumbNameWoExt)
              ? "csv_name_match"
              : "video_name_fallback"
            : "";
        } else {
          dropboxThumbnailId = thumbnailsMap.get(nameWithoutExt) || undefined;
          thumbnailSource = dropboxThumbnailId ? "video_name_match" : "";
        }
        if (dropboxThumbnailId) {
          console.log(
            `[UPLOAD-DROPBOX] Thumbnail match: "${video.name}" -> ${dropboxThumbnailId} (source: ${thumbnailSource})`,
          );
        }
        const rawTitle =
          csvMetadata?.youtube_title || video.name.replace(/\.[^/.]+$/, "");
        const rawDesc =
          csvMetadata?.youtube_description ||
          `Uploaded from Dropbox: ${video.name}`;
        return {
          title: sanitizeYoutubeTitle(rawTitle),
          video_name: video.name,
          description: sanitizeYoutubeDescription(rawDesc),
          privacyStatus: (csvMetadata?.privacyStatus ||
            csvMetadata?.privacystatus ||
            privacyStatus) as "public" | "private" | "unlisted",
          dropboxFileId: video.pathLower || video.id,
          postUploadAction:
            csvMetadata?.post_upload_action ||
            csvMetadata?.postuploadaction ||
            (postUploadAction !== "none" ? postUploadAction : undefined),
          completedFolderId:
            csvMetadata?.completed_folder_id ||
            csvMetadata?.completedfolderid ||
            completedFolderPath ||
            undefined,
          publishDate,
          thumbnailUrl: csvMetadata?.thumbnail_url || undefined,
          dropboxThumbnailId,
          urlAuthHeaders: csvMetadata?.url_auth_headers || undefined,
          urlTimeout: csvMetadata?.url_timeout || undefined,
          madeForKids:
            csvMetadata?.made_for_kids ||
            csvMetadata?.madeforkids ||
            csvMetadata?.selfDeclaredMadeForKids ||
            undefined,
        };
      };

      let queueItems: ReturnType<typeof buildItemFromCsvRow>[];
      if (hasCsvMetadata && csvData.length > 0) {
        // One item per CSV row – total/pending will match CSV row count
        queueItems = [];
        console.log(
          `[UPLOAD-DROPBOX] Using CSV-driven queue: ${csvData.length} rows, metadata map has ${csvMetadataMap.size} entries`,
        );

        // Build a lookup of folder videos by lowercase name (with and without extension)
        const videosByName = new Map<string, (typeof videos)[0]>();
        for (const v of videos) {
          const lower = v.name.toLowerCase().trim();
          const lowerNoExt = lower.replace(/\.[^/.]+$/, "");
          if (!videosByName.has(lower)) videosByName.set(lower, v);
          if (!videosByName.has(lowerNoExt)) videosByName.set(lowerNoExt, v);
        }

        let csvRowsSkipped = 0;
        for (const row of csvData) {
          const rawVideoName = getVideoNameFromRow(row);
          if (!rawVideoName) {
            csvRowsSkipped++;
            continue;
          }
          const videoName = rawVideoName.toLowerCase().trim();
          const videoNameNoExt = videoName.replace(/\.[^/.]+$/, "");

          // Match CSV row to a folder video by name
          const video =
            videosByName.get(videoName) ||
            videosByName.get(videoNameNoExt) ||
            // Partial match fallback
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
        if (csvRowsSkipped > 0) {
          console.log(
            `[UPLOAD-DROPBOX] Skipped ${csvRowsSkipped} CSV rows with no video name value`,
          );
        }
        // No matches: do not add anything to the queue; return error immediately
        if (matchedCount === 0) {
          return NextResponse.json(
            {
              error: `No videos matched CSV entries. Found ${videos.length} videos in folder, but none matched the ${csvData.length} entries in the CSV. Auto-detected video name column: "${videoNameColumn || "(none)"}". Nothing was added to the queue.`,
              totalVideos: videos.length,
              csvEntries: csvData.length,
              matchedCount: 0,
              filteredCount: unmatchedCount,
            },
            { status: 400 },
          );
        }
      } else {
        // No CSV: one item per folder video
        const allQueueItems = videos.map((video) => {
          const videoName = video.name.toLowerCase();
          const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
          const csvMetadata =
            matchCsvMetadata(videoName) || matchCsvMetadata(nameWithoutExt);
          if (csvMetadata) {
            matchedCount++;
            return buildItemFromCsvRow(video, csvMetadata);
          }
          unmatchedCount++;
          unmatchedVideos.push(video.name);
          const dropboxThumbnailIdNoCsv =
            thumbnailsMap.get(nameWithoutExt) || undefined;
          if (dropboxThumbnailIdNoCsv) {
            console.log(
              `[UPLOAD-DROPBOX] Thumbnail match: "${video.name}" -> ${dropboxThumbnailIdNoCsv} (source: video_name_match)`,
            );
          }
          return {
            title: sanitizeYoutubeTitle(video.name.replace(/\.[^/.]+$/, "")),
            video_name: video.name,
            description: sanitizeYoutubeDescription(
              `Uploaded from Dropbox: ${video.name}`,
            ),
            privacyStatus: privacyStatus as "public" | "private" | "unlisted",
            dropboxFileId: video.pathLower || video.id,
            dropboxThumbnailId: dropboxThumbnailIdNoCsv,
            postUploadAction:
              postUploadAction !== "none" ? postUploadAction : undefined,
            completedFolderId: completedFolderPath || undefined,
            publishDate: undefined,
            thumbnailUrl: undefined,
            urlAuthHeaders: undefined,
            urlTimeout: undefined,
            madeForKids: undefined,
          };
        });
        queueItems = allQueueItems;
        console.log(
          `[UPLOAD-DROPBOX] Using folder-driven queue: ${queueItems.length} videos (no CSV or metadata map empty)`,
        );
      }

      console.log(
        `[UPLOAD-DROPBOX] Queue size: ${queueItems.length} items (max pending will match this)`,
      );
      const thumbnailMatchCount = queueItems.filter(
        (item) => (item as { dropboxThumbnailId?: string }).dropboxThumbnailId,
      ).length;
      if (thumbnailsMap.size > 0) {
        console.log(
          `[UPLOAD-DROPBOX] Thumbnail summary: ${thumbnailMatchCount}/${queueItems.length} videos have a matched thumbnail from folder (${thumbnailsMap.size} image(s) in thumbnails folder)`,
        );
      }

      const filteredCount = hasCsvMetadata ? unmatchedCount : 0;

      console.log(
        `[UPLOAD-DROPBOX] Processing ${videos.length} videos from folder`,
      );
      if (hasCsvMetadata) {
        console.log(
          `[UPLOAD-DROPBOX] CSV provided: ${matchedCount} CSV rows with matching video, ${filteredCount} CSV rows with no matching file`,
        );
        if (unmatchedCount > 0) {
          console.log(
            `[UPLOAD-DROPBOX] Filtered videos (no CSV match): ${unmatchedVideos.slice(0, 10).join(", ")}${unmatchedCount > 10 ? `... and ${unmatchedCount - 10} more` : ""}`,
          );
        }
      } else {
        console.log(
          `[UPLOAD-DROPBOX] No CSV provided: ${queueItems.length} videos will be uploaded with default metadata`,
        );
      }

      if (queueItems.length === 0) {
        if (hasCsvMetadata) {
          return NextResponse.json(
            {
              error: `No videos matched CSV entries. Found ${videos.length} videos in folder, but none matched the ${csvData.length} entries in the CSV. Auto-detected video name column: "${videoNameColumn || "(none)"}".`,
              totalVideos: videos.length,
              csvEntries: csvData.length,
              matchedCount: 0,
              filteredCount: unmatchedCount,
            },
            { status: 400 },
          );
        } else {
          return NextResponse.json(
            {
              error: `No videos found to upload. Found ${videos.length} videos in folder.`,
            },
            { status: 400 },
          );
        }
      }

      // Check for duplicates against local uploaded-videos list (only when option enabled, no YouTube API)
      let duplicateCount = 0;
      if (skipDuplicateTitles && queueItems.length > 0) {
        const uploadedSet = getUploadedTitlesSet();
        const before = queueItems.length;
        queueItems = queueItems.filter((item) => {
          const t = (item.title || "").trim();
          const isDuplicate = t && uploadedSet.has(t.toLowerCase());
          if (isDuplicate) {
            console.log(
              `[UPLOAD-DROPBOX] Skipping duplicate: "${t.substring(0, 50)}..."`,
            );
          }
          return !isDuplicate;
        });
        duplicateCount = before - queueItems.length;
        if (duplicateCount > 0) {
          console.log(
            `[UPLOAD-DROPBOX] Filtered out ${duplicateCount} duplicate(s) from uploaded list`,
          );
        } else {
          console.log(
            `[UPLOAD-DROPBOX] No duplicates found, all ${queueItems.length} videos are new`,
          );
        }
      } else if (!skipDuplicateTitles && queueItems.length > 0) {
        console.log(
          `[UPLOAD-DROPBOX] Skip-duplicate-titles is off, not checking uploaded list`,
        );
      }

      if (queueItems.length === 0) {
        return NextResponse.json(
          {
            error: `All videos were filtered out. ${duplicateCount > 0 ? `${duplicateCount} duplicate(s) in uploaded list. ` : ""}No new videos to upload.`,
            totalVideos: videos.length,
            duplicateCount,
            filteredCount: hasCsvMetadata ? unmatchedCount : 0,
          },
          { status: 400 },
        );
      }

      const jobId = addToBulkQueue({
        sessionId,
        userId: session.userId,
        type: "urls", // Dropbox files are streamed similar to URLs
        items: queueItems,
        videosPerDay:
          videosPerDay && videosPerDay > 0 ? videosPerDay : undefined,
        startDate:
          videosPerDay && videosPerDay > 0
            ? new Date().toISOString()
            : undefined, // Start from today if scheduling
        ...(dropboxCsvPath && {
          dropboxCsvPath: dropboxCsvPath.startsWith("/")
            ? dropboxCsvPath
            : `/${dropboxCsvPath}`,
          dropboxSheetName: dropboxSheetName || undefined,
        }),
      });

      const warnings: string[] = [];
      if (hasCsvMetadata && unmatchedCount > 0) {
        warnings.push(`${unmatchedCount} filtered out (no CSV match)`);
      }
      if (duplicateCount > 0) {
        warnings.push(
          `${duplicateCount} duplicate(s) skipped (in uploaded list)`,
        );
      }

      return NextResponse.json({
        success: true,
        message: hasCsvMetadata
          ? `Upload queued: ${queueItems.length} videos matched CSV entries${warnings.length > 0 ? `, ${warnings.join(", ")}` : ""}`
          : `Upload queued: ${queueItems.length} videos${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped)` : ""}`,
        jobId,
        totalItems: queueItems.length,
        totalVideos: videos.length,
        matchedFromCsv: hasCsvMetadata ? matchedCount : undefined,
        filteredCount: hasCsvMetadata ? unmatchedCount : undefined,
        duplicateCount,
        folderPath: normalizedPath,
      });
    } else {
      // Direct upload (not implemented for Dropbox - use worker)
      return NextResponse.json(
        {
          error:
            "Direct upload not supported for Dropbox. Please use worker mode.",
        },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("[UPLOAD-DROPBOX] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error processing Dropbox folder" },
      { status: 500 },
    );
  }
}
