/**
 * Async Python queue dashboard summary (filesystem + per-session Dropbox root).
 */

import type { PythonQueueData } from "@/app/components/dashboard/types";
import type { OAuth2Client } from "google-auth-library";
import { getDriveOAuthClientForSession } from "@/lib/auth-drive";
import {
  getQueueSourceForSession,
  normalizeDropboxPath,
} from "@/lib/queue-source";
import {
  getPythonMaxPerTick,
  getPythonQueueUiSummary,
  manifestId,
  normalizeManifest,
  type PythonQueueUiItem,
} from "@/lib/python-queue";
import { listDropboxItems } from "@/lib/dropbox";
import {
  downloadAndParseManifest,
  dropboxVideoExists,
} from "@/lib/python-queue-dropbox";
import {
  downloadAndParseManifestDrive,
  driveVideoExists,
  listManifestJsonFileIdsSortedDrive,
} from "@/lib/python-queue-drive";
import { listDriveItems } from "@/lib/drive";

const MAX_UI_MANIFEST_FILES = 50;

function emptySummary(): Omit<PythonQueueData, "uploadsTodayUtc"> {
  return {
    enabled: false,
    maxPerTick: getPythonMaxPerTick(),
    skipDuplicateTitles: process.env.PYTHON_SKIP_DUPLICATE_TITLES === "true",
    sessionIdEnvConfigured: !!process.env.PYTHON_SESSION_ID?.trim(),
    pending: [],
    failedCount: 0,
    processedCount: 0,
  };
}

async function countJsonInDropboxFolder(
  folderPath: string,
  accessToken: string,
  sessionId: string,
  refresh: string | null,
  max: number,
): Promise<number> {
  try {
    const items = await listDropboxItems(
      folderPath,
      accessToken,
      sessionId,
      refresh,
    );
    let n = 0;
    for (const it of items) {
      if (it.type === "file" && it.name.toLowerCase().endsWith(".json")) {
        n++;
        if (n >= max) return max;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * Build GET /api/python-queue payload for the authenticated session.
 */
export async function getPythonQueueDataForSession(
  sessionId: string,
  dropboxAccessToken: string | null | undefined,
  dropboxRefreshToken: string | null | undefined,
): Promise<PythonQueueData> {
  const fsSummary = getPythonQueueUiSummary();
  const src = getQueueSourceForSession(sessionId);

  if (!src) {
    return {
      ...fsSummary,
      uploadsTodayUtc: 0,
      source: fsSummary.enabled ? "filesystem" : undefined,
    };
  }

  if (src.sourceType === "drive_python_queue") {
    const driveClient = await getDriveOAuthClientForSession(sessionId);
    return buildDrivePythonQueueData(
      sessionId,
      src.rootPath,
      driveClient,
      fsSummary,
    );
  }

  if (src.sourceType !== "dropbox_python_queue") {
    return {
      ...fsSummary,
      uploadsTodayUtc: 0,
      source: fsSummary.enabled ? "filesystem" : undefined,
    };
  }

  const root = normalizeDropboxPath(src.rootPath);
  const token = dropboxAccessToken;
  if (!token) {
    return {
      ...emptySummary(),
      uploadsTodayUtc: 0,
      enabled: false,
      dropboxConfigured: true,
      manifestQueueConfigured: true,
      source: "dropbox",
      queueRootLabel: root.split("/").filter(Boolean).pop() || root,
    };
  }

  const manifestsPath = `${root}/manifests`.replace(/\/+/g, "/");
  const processedPath = `${root}/processed`.replace(/\/+/g, "/");
  const failedPath = `${root}/failed`.replace(/\/+/g, "/");

  let items: Awaited<ReturnType<typeof listDropboxItems>>;
  try {
    items = await listDropboxItems(
      manifestsPath,
      token,
      sessionId,
      dropboxRefreshToken ?? null,
    );
  } catch {
    return {
      ...emptySummary(),
      maxPerTick: fsSummary.maxPerTick,
      skipDuplicateTitles: fsSummary.skipDuplicateTitles,
      sessionIdEnvConfigured: fsSummary.sessionIdEnvConfigured,
      uploadsTodayUtc: 0,
      enabled: true,
      dropboxConfigured: true,
      source: "dropbox",
      queueRootLabel: root.split("/").filter(Boolean).pop() || root,
      dropboxRootPath: root,
    };
  }

  const jsonFiles = items
    .filter(
      (i) => i.type === "file" && i.name.toLowerCase().endsWith(".json"),
    )
    .slice(0, MAX_UI_MANIFEST_FILES);

  const pending: PythonQueueUiItem[] = [];
  for (const f of jsonFiles) {
    const manifestPath =
      f.id.startsWith("/") ? normalizeDropboxPath(f.id) : `${manifestsPath}/${f.name}`.replace(/\/+/g, "/");
    const manifest = await downloadAndParseManifest(
      manifestPath,
      token,
      sessionId,
      dropboxRefreshToken ?? null,
    );
    if (!manifest) continue;
    const id = manifestId(manifest, manifestPath);
    const videoReady = await dropboxVideoExists(
      root,
      manifest.videoPath,
      token,
      sessionId,
      dropboxRefreshToken ?? null,
    );
    const norm = normalizeManifest(manifest);
    pending.push({
      id,
      title: manifest.title,
      priority:
        typeof manifest.priority === "number" && !Number.isNaN(manifest.priority)
          ? manifest.priority
          : 0,
      locked: false,
      videoReady,
      fileName: f.name,
      videoType: norm.videoType,
      isShort: norm.isShort,
    });
  }

  const [failedCount, processedCount] = await Promise.all([
    countJsonInDropboxFolder(
      failedPath,
      token,
      sessionId,
      dropboxRefreshToken ?? null,
      500,
    ),
    countJsonInDropboxFolder(
      processedPath,
      token,
      sessionId,
      dropboxRefreshToken ?? null,
      500,
    ),
  ]);

  return {
    enabled: true,
    queueRootLabel:
      root.split("/").filter(Boolean).pop() || root || fsSummary.queueRootLabel,
    maxPerTick: fsSummary.maxPerTick,
    skipDuplicateTitles: fsSummary.skipDuplicateTitles,
    sessionIdEnvConfigured: fsSummary.sessionIdEnvConfigured,
    pending: fsSummary.enabled
      ? [
          ...fsSummary.pending.map((p) => ({ ...p, id: `fs:${p.id}` })),
          ...pending.map((p) => ({ ...p, id: `db:${p.id}` })),
        ]
      : pending.map((p) => ({ ...p, id: `db:${p.id}` })),
    failedCount: fsSummary.failedCount + failedCount,
    processedCount: fsSummary.processedCount + processedCount,
    uploadsTodayUtc: 0,
    source: fsSummary.enabled ? "both" : "dropbox",
    dropboxConfigured: true,
    manifestQueueConfigured: true,
    dropboxRootPath: root,
  };
}

async function countJsonInDriveFolder(
  folderId: string,
  auth: OAuth2Client,
  max: number,
): Promise<number> {
  try {
    const { files } = await listDriveItems(folderId, auth);
    let n = 0;
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".json")) {
        n++;
        if (n >= max) return max;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

async function buildDrivePythonQueueData(
  sessionId: string,
  rootFolderId: string,
  driveClient: OAuth2Client | null,
  fsSummary: ReturnType<typeof getPythonQueueUiSummary>,
): Promise<PythonQueueData> {
  if (!driveClient) {
    return {
      ...emptySummary(),
      uploadsTodayUtc: 0,
      enabled: false,
      driveConfigured: true,
      manifestQueueConfigured: true,
      source: "drive",
      queueRootLabel: rootFolderId.slice(0, 12),
      driveRootFolderId: rootFolderId,
    };
  }

  const manifestIds = await listManifestJsonFileIdsSortedDrive(
    rootFolderId,
    driveClient,
  );
  const pending: PythonQueueUiItem[] = [];

  for (const manifestPath of manifestIds.slice(0, MAX_UI_MANIFEST_FILES)) {
    const manifest = await downloadAndParseManifestDrive(
      manifestPath,
      driveClient,
    );
    if (!manifest) continue;
    const id = manifestId(manifest, manifestPath);
    const videoReady = await driveVideoExists(
      rootFolderId,
      manifest.videoPath,
      driveClient,
    );
    const norm = normalizeManifest(manifest);
    pending.push({
      id,
      title: manifest.title,
      priority:
        typeof manifest.priority === "number" && !Number.isNaN(manifest.priority)
          ? manifest.priority
          : 0,
      locked: false,
      videoReady,
      fileName: manifestPath.slice(0, 8),
      videoType: norm.videoType,
      isShort: norm.isShort,
    });
  }

  let failedCount = 0;
  let processedCount = 0;
  try {
    const { folders } = await listDriveItems(rootFolderId, driveClient);
    const failedFolder = folders.find((f) => f.name.toLowerCase() === "failed");
    const processedFolder = folders.find(
      (f) => f.name.toLowerCase() === "processed",
    );
    if (failedFolder) {
      failedCount = await countJsonInDriveFolder(
        failedFolder.id,
        driveClient,
        500,
      );
    }
    if (processedFolder) {
      processedCount = await countJsonInDriveFolder(
        processedFolder.id,
        driveClient,
        500,
      );
    }
  } catch {
    /* ignore */
  }

  return {
    enabled: true,
    queueRootLabel: rootFolderId.slice(0, 12),
    maxPerTick: fsSummary.maxPerTick,
    skipDuplicateTitles: fsSummary.skipDuplicateTitles,
    sessionIdEnvConfigured: fsSummary.sessionIdEnvConfigured,
    pending: fsSummary.enabled
      ? [
          ...fsSummary.pending.map((p) => ({ ...p, id: `fs:${p.id}` })),
          ...pending.map((p) => ({ ...p, id: `drv:${p.id}` })),
        ]
      : pending.map((p) => ({ ...p, id: `drv:${p.id}` })),
    failedCount: fsSummary.failedCount + failedCount,
    processedCount: fsSummary.processedCount + processedCount,
    uploadsTodayUtc: 0,
    source: fsSummary.enabled ? "both" : "drive",
    driveConfigured: true,
    manifestQueueConfigured: true,
    driveRootFolderId: rootFolderId,
  };
}
