/**
 * Probe a Dropbox folder for Python-bot queue layout (manifests + videos + thumbnails).
 */

import { listDropboxItems } from "@/lib/dropbox";
import { normalizeDropboxPath } from "@/lib/queue-source";

export type DropboxDetectMode = "python_queue" | "standard_dropbox_folder";

export interface DropboxDetectResult {
  mode: DropboxDetectMode;
  manifestCount: number;
  videoCount: number;
  thumbnailCount: number;
  /** Queue root: selected folder or selected/queue when nested layout is used */
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
  folderPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
  filter: (name: string, type: "file" | "folder") => boolean,
  max: number,
): Promise<number> {
  const items = await listDropboxItems(
    folderPath,
    accessToken,
    sessionId,
    refresh ?? null,
  );
  let n = 0;
  for (const it of items) {
    if (n >= max) return max;
    if (filter(it.name, it.type)) n++;
  }
  return n;
}

async function countJsonManifests(
  manifestsPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<number> {
  return countInFolder(
    manifestsPath,
    accessToken,
    sessionId,
    refresh,
    (name, type) => type === "file" && lowerName(name).endsWith(".json"),
    MAX_MANIFEST_JSON_COUNT,
  );
}

/** JSON manifest files placed directly under queue root (some bots use this instead of manifests/). */
async function countJsonManifestsAtQueueRoot(
  queueRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<number> {
  return countInFolder(
    queueRoot,
    accessToken,
    sessionId,
    refresh,
    (name, type) => type === "file" && lowerName(name).endsWith(".json"),
    MAX_MANIFEST_JSON_COUNT,
  );
}

async function countVideos(
  videosPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<number> {
  return countInFolder(
    videosPath,
    accessToken,
    sessionId,
    refresh,
    (name, type) => type === "file" && isVideoFile(name),
    MAX_MEDIA_FILES_COUNT,
  );
}

async function countThumbnails(
  thumbsPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<number> {
  return countInFolder(
    thumbsPath,
    accessToken,
    sessionId,
    refresh,
    (name, type) => type === "file" && isThumbFile(name),
    MAX_MEDIA_FILES_COUNT,
  );
}

async function folderExists(
  folderPath: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<boolean> {
  if (folderPath === "/" || folderPath === "") return true;
  try {
    await listDropboxItems(
      folderPath,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    return true;
  } catch {
    return false;
  }
}

function joinPosix(base: string, ...parts: string[]): string {
  let s = normalizeDropboxPath(base);
  for (const p of parts) {
    const seg = p.replace(/^\/+|\/+$/g, "");
    if (!seg) continue;
    s = `${s}/${seg}`.replace(/\/+/g, "/");
  }
  return normalizeDropboxPath(s);
}

/**
 * Inspect `dropboxPath` for manifests/videos/thumbnails (flat or under `queue/`).
 */
export async function detectDropboxPythonQueueLayout(
  dropboxPath: string,
  accessToken: string,
  sessionId: string | undefined,
  sessionRefreshToken: string | null | undefined,
): Promise<DropboxDetectResult> {
  const base = normalizeDropboxPath(dropboxPath);

  const candidates: string[] = [base, joinPosix(base, "queue")];

  for (const root of candidates) {
    const manifestsPath = joinPosix(root, "manifests");
    const videosPath = joinPosix(root, "videos");
    const thumbsPath = joinPosix(root, "thumbnails");

    const hasManifestsDir = await folderExists(
      manifestsPath,
      accessToken,
      sessionId,
      sessionRefreshToken,
    );
    let manifestCount = 0;
    if (hasManifestsDir) {
      manifestCount = await countJsonManifests(
        manifestsPath,
        accessToken,
        sessionId,
        sessionRefreshToken,
      );
    }
    if (manifestCount === 0) {
      manifestCount = await countJsonManifestsAtQueueRoot(
        root,
        accessToken,
        sessionId,
        sessionRefreshToken,
      );
    }
    if (manifestCount === 0) continue;

    const hasVideos = await folderExists(
      videosPath,
      accessToken,
      sessionId,
      sessionRefreshToken,
    );
    const hasThumbs = await folderExists(
      thumbsPath,
      accessToken,
      sessionId,
      sessionRefreshToken,
    );

    const videoCount = hasVideos
      ? await countVideos(
          videosPath,
          accessToken,
          sessionId,
          sessionRefreshToken,
        )
      : 0;
    const thumbnailCount = hasThumbs
      ? await countThumbnails(
          thumbsPath,
          accessToken,
          sessionId,
          sessionRefreshToken,
        )
      : 0;

    const looksPython =
      manifestCount > 0 && (hasVideos || hasThumbs);

    if (looksPython) {
      return {
        mode: "python_queue",
        manifestCount,
        videoCount,
        thumbnailCount,
        resolvedRoot: root,
      };
    }
  }

  return {
    mode: "standard_dropbox_folder",
    manifestCount: 0,
    videoCount: 0,
    thumbnailCount: 0,
    resolvedRoot: base,
  };
}
