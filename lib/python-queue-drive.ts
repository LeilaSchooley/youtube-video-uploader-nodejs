/**
 * Python manifest queue backed by Google Drive folder IDs (per-session queue root).
 */

import path from "path";
import { Readable } from "stream";
import type { OAuth2Client } from "google-auth-library";
import {
  deleteDriveFile,
  downloadDriveFileToBuffer,
  getDriveClient,
  getDriveFileMetadata,
  isDriveFileId,
  listDriveItems,
  moveDriveFile,
} from "@/lib/drive";
import type { ParsedManifestEntry, PythonManifest } from "@/lib/python-queue";
import { parseManifestJson } from "@/lib/python-queue";

function normalizeManifestPathForDrive(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return t;

  const winAbs = /^[A-Za-z]:[\\/]/.test(t);
  if (winAbs) t = t.replace(/\\/g, "/");

  const uq = "/upload_queue/";
  const uqIdx = t.toLowerCase().indexOf(uq);
  if (uqIdx >= 0) {
    return t.slice(uqIdx + uq.length).replace(/^\/+/, "");
  }

  if (
    t.startsWith("/home/") ||
    t.startsWith("/Users/") ||
    t.startsWith("/private/")
  ) {
    let i = t.indexOf("/videos/");
    if (i >= 0) return t.slice(i + 1);
    i = t.indexOf("/thumbnails/");
    if (i >= 0) return t.slice(i + 1);
    const base = path.posix.basename(t);
    if (base) return `videos/${base}`;
    return t;
  }

  if (winAbs) {
    let i = t.toLowerCase().lastIndexOf("/videos/");
    if (i >= 0) return t.slice(i + 1);
    i = t.toLowerCase().lastIndexOf("/thumbnails/");
    if (i >= 0) return t.slice(i + 1);
    const base = path.posix.basename(t);
    if (base) return `videos/${base}`;
    return t;
  }

  if (!t.startsWith("/")) {
    let u = t.replace(/^\.?\//, "");
    if (/^queue\/(videos\/|thumbnails\/)/i.test(u)) {
      u = u.replace(/^queue\//i, "");
    }
    return u;
  }

  return t.replace(/^\/+/, "");
}

async function findChildFolderId(
  parentFolderId: string,
  folderName: string,
  auth: OAuth2Client,
): Promise<string | null> {
  const { folders } = await listDriveItems(parentFolderId, auth);
  const want = folderName.toLowerCase();
  const hit = folders.find((f) => f.name.toLowerCase() === want);
  return hit?.id ?? null;
}

async function findChildFileId(
  parentFolderId: string,
  fileName: string,
  auth: OAuth2Client,
): Promise<string | null> {
  const { files } = await listDriveItems(parentFolderId, auth);
  const want = fileName.toLowerCase();
  const hit = files.find((f) => f.name.toLowerCase() === want);
  return hit?.id ?? null;
}

async function ensureChildFolderId(
  parentFolderId: string,
  folderName: string,
  auth: OAuth2Client,
): Promise<string> {
  const existing = await findChildFolderId(parentFolderId, folderName, auth);
  if (existing) return existing;

  const drive = getDriveClient(auth);
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });
  if (!created.data.id) {
    throw new Error(`Failed to create Drive folder ${folderName}`);
  }
  return created.data.id;
}

export async function resolveDriveFileInQueue(
  queueRootFolderId: string,
  rawPath: string,
  auth: OAuth2Client,
): Promise<string | null> {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (isDriveFileId(trimmed)) return trimmed;

  const rel = normalizeManifestPathForDrive(trimmed);
  if (!rel) return null;
  const parts = rel.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let folderId = queueRootFolderId;
  for (let i = 0; i < parts.length - 1; i++) {
    const sub = await findChildFolderId(folderId, parts[i], auth);
    if (!sub) return null;
    folderId = sub;
  }
  return findChildFileId(folderId, parts[parts.length - 1], auth);
}

export async function downloadAndParseManifestDrive(
  manifestFileId: string,
  auth: OAuth2Client,
): Promise<PythonManifest | null> {
  try {
    const buffer = await downloadDriveFileToBuffer(manifestFileId, auth);
    const data = JSON.parse(buffer.toString("utf8")) as unknown;
    return parseManifestJson(data);
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DRIVE] Failed to parse manifest ${manifestFileId}:`,
      e,
    );
    return null;
  }
}

export async function downloadDriveManifestRawJson(
  manifestFileId: string,
  auth: OAuth2Client,
): Promise<string | null> {
  try {
    const buffer = await downloadDriveFileToBuffer(manifestFileId, auth);
    return buffer.toString("utf8");
  } catch (e) {
    console.error(
      `[PYTHON-QUEUE-DRIVE] Failed to download manifest ${manifestFileId}:`,
      e,
    );
    return null;
  }
}

export async function updateDriveFileUtf8(
  fileId: string,
  content: string,
  auth: OAuth2Client,
): Promise<void> {
  const drive = getDriveClient(auth);
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: Readable.from(Buffer.from(content, "utf8")),
    },
  });
}

export async function mergeManifestJsonOnDrive(
  manifestFileId: string,
  patch: Record<string, unknown>,
  auth: OAuth2Client,
): Promise<void> {
  const raw = await downloadDriveManifestRawJson(manifestFileId, auth);
  if (raw === null) {
    throw new Error(`Could not read manifest: ${manifestFileId}`);
  }
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON in manifest: ${manifestFileId}`);
  }
  const merged = { ...base, ...patch };
  await updateDriveFileUtf8(
    manifestFileId,
    `${JSON.stringify(merged, null, 2)}\n`,
    auth,
  );
}

async function listJsonFileIdsInFolder(
  folderId: string,
  auth: OAuth2Client,
): Promise<string[]> {
  try {
    const { files } = await listDriveItems(folderId, auth);
    return files
      .filter((f) => f.name.toLowerCase().endsWith(".json"))
      .map((f) => f.id)
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error(`[PYTHON-QUEUE-DRIVE] Cannot list folder ${folderId}:`, e);
    return [];
  }
}

async function resolveManifestsFolderId(
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<string | null> {
  const manifestsId = await findChildFolderId(
    queueRootFolderId,
    "manifests",
    auth,
  );
  return manifestsId;
}

export async function listManifestJsonFileIdsSortedDrive(
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<string[]> {
  const manifestsFolderId = await resolveManifestsFolderId(
    queueRootFolderId,
    auth,
  );
  if (manifestsFolderId) {
    const fromManifests = await listJsonFileIdsInFolder(manifestsFolderId, auth);
    if (fromManifests.length > 0) return fromManifests;
  }
  return listJsonFileIdsInFolder(queueRootFolderId, auth);
}

export async function listPendingManifestsFromDriveSorted(
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<ParsedManifestEntry[]> {
  const ids = await listManifestJsonFileIdsSortedDrive(queueRootFolderId, auth);
  const entries: ParsedManifestEntry[] = [];

  for (const manifestPath of ids) {
    const manifest = await downloadAndParseManifestDrive(manifestPath, auth);
    if (!manifest) continue;
    const pr =
      typeof manifest.priority === "number" && !Number.isNaN(manifest.priority)
        ? manifest.priority
        : 0;
    entries.push({ manifestPath, manifest, priority: pr });
  }

  entries.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.manifestPath.localeCompare(b.manifestPath);
  });

  return entries;
}

export async function moveDriveManifestToProcessed(
  manifestFileId: string,
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<void> {
  const processedId = await ensureChildFolderId(
    queueRootFolderId,
    "processed",
    auth,
  );
  try {
    await moveDriveFile(manifestFileId, processedId, auth);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    if (!lower.includes("not found") && !lower.includes("404")) {
      throw error;
    }
    try {
      await deleteDriveFile(manifestFileId, auth);
    } catch {
      throw error;
    }
  }
}

export async function moveDriveManifestToFailed(
  manifestFileId: string,
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<void> {
  const failedId = await ensureChildFolderId(queueRootFolderId, "failed", auth);
  await moveDriveFile(manifestFileId, failedId, auth);
}

export async function moveDriveManifestToManifests(
  manifestFileId: string,
  queueRootFolderId: string,
  auth: OAuth2Client,
): Promise<void> {
  const manifestsId = await ensureChildFolderId(
    queueRootFolderId,
    "manifests",
    auth,
  );
  await moveDriveFile(manifestFileId, manifestsId, auth);
}

export async function deleteDriveManifest(
  manifestFileId: string,
  auth: OAuth2Client,
): Promise<void> {
  await deleteDriveFile(manifestFileId, auth);
}

export async function driveVideoExists(
  queueRootFolderId: string,
  videoRelPath: string,
  auth: OAuth2Client,
): Promise<boolean> {
  const id = await resolveDriveFileInQueue(
    queueRootFolderId,
    videoRelPath,
    auth,
  );
  if (!id) return false;
  try {
    await getDriveFileMetadata(id, auth);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDriveVideoFileId(
  queueRootFolderId: string,
  videoPath: string,
  auth: OAuth2Client,
): Promise<string | null> {
  return resolveDriveFileInQueue(queueRootFolderId, videoPath, auth);
}

export async function resolveDriveThumbnailFileId(
  queueRootFolderId: string,
  thumbRel: string,
  auth: OAuth2Client,
): Promise<string | null> {
  return resolveDriveFileInQueue(queueRootFolderId, thumbRel, auth);
}

export function isManifestFileIdUnderDriveQueue(
  manifestFileId: string,
  queueRootFolderId: string,
  knownManifestIds: string[],
): boolean {
  if (!isDriveFileId(manifestFileId)) return false;
  if (manifestFileId === queueRootFolderId) return false;
  return knownManifestIds.includes(manifestFileId);
}
