import type { ManifestQueueAuth } from "@/lib/manifest-queue-api-auth";
import type { PythonManifest } from "@/lib/python-queue";
import {
  listManifestQueueRows,
  listManifestQueueRowsDrive,
} from "@/lib/manifest-queue-list";
import {
  deleteDropboxManifest,
  downloadAndParseManifest,
  listManifestJsonPathsSortedDropbox,
  mergeManifestJsonOnDropbox,
  moveDropboxManifestToFailed,
  moveDropboxManifestToManifests,
} from "@/lib/python-queue-dropbox";
import {
  deleteDriveManifest,
  downloadAndParseManifestDrive,
  listManifestJsonFileIdsSortedDrive,
  mergeManifestJsonOnDrive,
  moveDriveManifestToFailed,
  moveDriveManifestToManifests,
} from "@/lib/python-queue-drive";

export type ManifestQueueAuthOk = Extract<ManifestQueueAuth, { ok: true }>;

export async function listManifestPathsSorted(
  auth: ManifestQueueAuthOk,
): Promise<string[]> {
  if (auth.sourceType === "drive_python_queue") {
    return listManifestJsonFileIdsSortedDrive(
      auth.queueRoot,
      auth.driveClient,
    );
  }
  return listManifestJsonPathsSortedDropbox(
    auth.queueRoot,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function listManifestRowsForAuth(auth: ManifestQueueAuthOk) {
  if (auth.sourceType === "drive_python_queue") {
    return listManifestQueueRowsDrive(auth.queueRoot, auth.driveClient);
  }
  return listManifestQueueRows(
    auth.queueRoot,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function downloadManifestForAuth(
  auth: ManifestQueueAuthOk,
  manifestPath: string,
): Promise<PythonManifest | null> {
  if (auth.sourceType === "drive_python_queue") {
    return downloadAndParseManifestDrive(manifestPath, auth.driveClient);
  }
  return downloadAndParseManifest(
    manifestPath,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function deleteManifestForAuth(
  auth: ManifestQueueAuthOk,
  manifestPath: string,
): Promise<void> {
  if (auth.sourceType === "drive_python_queue") {
    await deleteDriveManifest(manifestPath, auth.driveClient);
    return;
  }
  await deleteDropboxManifest(
    manifestPath,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function mergeManifestPatchForAuth(
  auth: ManifestQueueAuthOk,
  manifestPath: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (auth.sourceType === "drive_python_queue") {
    await mergeManifestJsonOnDrive(manifestPath, patch, auth.driveClient);
    return;
  }
  await mergeManifestJsonOnDropbox(
    manifestPath,
    patch,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function moveManifestToFailedForAuth(
  auth: ManifestQueueAuthOk,
  manifestPath: string,
): Promise<void> {
  if (auth.sourceType === "drive_python_queue") {
    await moveDriveManifestToFailed(
      manifestPath,
      auth.queueRoot,
      auth.driveClient,
    );
    return;
  }
  await moveDropboxManifestToFailed(
    manifestPath,
    auth.queueRoot,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}

export async function moveManifestToManifestsForAuth(
  auth: ManifestQueueAuthOk,
  manifestPath: string,
): Promise<void> {
  if (auth.sourceType === "drive_python_queue") {
    await moveDriveManifestToManifests(
      manifestPath,
      auth.queueRoot,
      auth.driveClient,
    );
    return;
  }
  await moveDropboxManifestToManifests(
    manifestPath,
    auth.queueRoot,
    auth.accessToken,
    auth.sessionId,
    auth.refresh,
  );
}
