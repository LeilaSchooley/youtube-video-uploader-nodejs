/**
 * Probe a Google Drive folder for Python-bot queue layout (manifests + videos + thumbnails).
 */

import type { OAuth2Client } from "google-auth-library";
import { listDriveItems } from "@/lib/drive";
import { normalizeDriveFolderId } from "@/lib/queue-source";

export type DriveDetectMode = "python_queue" | "standard_drive_folder";

export interface DriveDetectResult {
  mode: DriveDetectMode;
  manifestCount: number;
  videoCount: number;
  thumbnailCount: number;
  /** Queue root folder ID */
  resolvedRoot: string;
}

const MAX_MANIFEST_JSON_COUNT = 500;
const MAX_MEDIA_FILES_COUNT = 2000;

const VIDEO_EXT = [
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".flv",
  ".wmv",
  ".m4v",
];
const THUMB_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function lowerName(name: string): string {
  return name.toLowerCase();
}

function isVideoFile(name: string): boolean {
  const n = lowerName(name);
  return VIDEO_EXT.some((ext) => n.endsWith(ext));
}

function isThumbFile(name: string): boolean {
  const n = lowerName(name);
  return THUMB_EXT.some((ext) => n.endsWith(ext));
}

async function countInFolder(
  folderId: string,
  auth: OAuth2Client,
  filter: (name: string, isFolder: boolean) => boolean,
  max: number,
): Promise<number> {
  const { folders, files } = await listDriveItems(folderId, auth);
  let n = 0;
  for (const f of folders) {
    if (n >= max) return max;
    if (filter(f.name, true)) n++;
  }
  for (const f of files) {
    if (n >= max) return max;
    if (filter(f.name, false)) n++;
  }
  return n;
}

async function safeCount(countFn: () => Promise<number>): Promise<number> {
  try {
    return await countFn();
  } catch {
    return 0;
  }
}

async function findSubfolderId(
  parentId: string,
  name: string,
  auth: OAuth2Client,
): Promise<string | null> {
  const { folders } = await listDriveItems(parentId, auth);
  const want = name.toLowerCase();
  return folders.find((f) => f.name.toLowerCase() === want)?.id ?? null;
}

async function folderExists(
  folderId: string,
  auth: OAuth2Client,
): Promise<boolean> {
  try {
    await listDriveItems(folderId, auth);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect `folderId` for manifests/videos/thumbnails (flat or under `queue/`).
 */
export async function detectDrivePythonQueueLayout(
  folderId: string,
  auth: OAuth2Client,
): Promise<DriveDetectResult> {
  const base = normalizeDriveFolderId(folderId);

  const candidates: string[] = [base];
  const nestedQueue = await findSubfolderId(base, "queue", auth);
  if (nestedQueue) candidates.push(nestedQueue);

  for (const root of candidates) {
    try {
      const manifestsId = await findSubfolderId(root, "manifests", auth);
      const videosId = await findSubfolderId(root, "videos", auth);
      const thumbsId = await findSubfolderId(root, "thumbnails", auth);

      const hasManifestsDir = manifestsId
        ? await folderExists(manifestsId, auth)
        : false;
      const hasVideos = videosId ? await folderExists(videosId, auth) : false;
      const hasThumbs = thumbsId ? await folderExists(thumbsId, auth) : false;
      const hasQueueLayoutDirs = hasManifestsDir && (hasVideos || hasThumbs);

      let manifestCount = 0;
      if (manifestsId) {
        manifestCount = await safeCount(() =>
          countInFolder(
            manifestsId,
            auth,
            (name, isFolder) =>
              !isFolder && lowerName(name).endsWith(".json"),
            MAX_MANIFEST_JSON_COUNT,
          ),
        );
      }
      if (manifestCount === 0) {
        manifestCount = await safeCount(() =>
          countInFolder(
            root,
            auth,
            (name, isFolder) =>
              !isFolder && lowerName(name).endsWith(".json"),
            MAX_MANIFEST_JSON_COUNT,
          ),
        );
      }

      const videoCount = videosId
        ? await safeCount(() =>
            countInFolder(
              videosId,
              auth,
              (name, isFolder) => !isFolder && isVideoFile(name),
              MAX_MEDIA_FILES_COUNT,
            ),
          )
        : 0;
      const thumbnailCount = thumbsId
        ? await safeCount(() =>
            countInFolder(
              thumbsId,
              auth,
              (name, isFolder) => !isFolder && isThumbFile(name),
              MAX_MEDIA_FILES_COUNT,
            ),
          )
        : 0;

      const looksPython =
        hasQueueLayoutDirs || (manifestCount > 0 && (hasVideos || hasThumbs));

      if (looksPython) {
        return {
          mode: "python_queue",
          manifestCount,
          videoCount,
          thumbnailCount,
          resolvedRoot: root,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    mode: "standard_drive_folder",
    manifestCount: 0,
    videoCount: 0,
    thumbnailCount: 0,
    resolvedRoot: base,
  };
}
