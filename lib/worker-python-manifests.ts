import fs from "fs";
import path from "path";
import { google } from "googleapis";
import {
  appendUploadedVideo,
  getUploadedTitlesSet,
} from "./uploaded-videos";
import { getSession, loadSessions } from "./session";
import { getOAuthClient, getDropboxToken } from "./auth";
import {
  getPythonQueueRoot,
  isPythonQueueEnabled,
  listPendingManifestsSorted,
  manifestId,
  moveManifestToFailed,
  moveManifestToProcessed,
  releaseLock,
  resolveUnderQueueRoot,
  tryAcquireLock,
  type ParsedManifestEntry,
} from "./python-queue";
import { getAllDropboxPythonQueueSessions } from "./queue-source";
import {
  listManifestJsonPathsSortedDropbox,
  downloadAndParseManifest,
  moveDropboxManifestToProcessed,
  moveDropboxManifestToFailed,
  resolveDropboxVideoPath,
  resolveDropboxThumbnailPath,
  dropboxVideoExists,
} from "./python-queue-dropbox";
import { workerLog } from "./worker-logger";
import { writeHeartbeat } from "./worker-health";
import { getDropboxFileMetadata } from "./dropbox";
import type { UploadTask } from "./worker-upload";
import { workerUploadVideo } from "./worker-upload";

/** In-process locks for Dropbox manifest paths (single-worker assumption). */
const dropboxPythonLocks = new Set<string>();

function dropboxPythonLockKey(
  queueOwnerSessionId: string,
  manifestPath: string,
): string {
  return `${queueOwnerSessionId}::${manifestPath}`;
}

function tryAcquireDropboxPythonLock(key: string): boolean {
  if (dropboxPythonLocks.has(key)) return false;
  dropboxPythonLocks.add(key);
  return true;
}

function releaseDropboxPythonLock(key: string): void {
  dropboxPythonLocks.delete(key);
}

type PythonWorkItem =
  | { kind: "fs"; entry: ParsedManifestEntry }
  | {
      kind: "db";
      queueOwnerSessionId: string;
      queueRoot: string;
      manifestPath: string;
    };

export async function processPythonManifestJobs(): Promise<string | undefined> {
  loadSessions();
  const hasDropboxQueues = getAllDropboxPythonQueueSessions().length > 0;
  if (!isPythonQueueEnabled() && !hasDropboxQueues) {
    return undefined;
  }

  const maxPerTick = Math.max(
    1,
    parseInt(process.env.PYTHON_QUEUE_MAX_PER_TICK || "1", 10) || 1,
  );

  const skipDupes = process.env.PYTHON_SKIP_DUPLICATE_TITLES === "true";
  const uploadedTitles = skipDupes ? getUploadedTitlesSet() : null;

  const workQueue: PythonWorkItem[] = [];
  if (isPythonQueueEnabled()) {
    const root = getPythonQueueRoot();
    if (root) {
      for (const entry of listPendingManifestsSorted()) {
        workQueue.push({ kind: "fs", entry });
      }
    }
  }

  for (const { sessionId: qSid, rootPath } of getAllDropboxPythonQueueSessions()) {
    const qSession = getSession(qSid);
    if (!qSession?.authenticated || !qSession.tokens) continue;
    const qToken = await getDropboxToken(
      qSession.dropboxToken,
      qSession.dropboxRefreshToken,
      qSid,
    );
    if (!qToken) continue;
    const paths = await listManifestJsonPathsSortedDropbox(
      rootPath,
      qToken,
      qSid,
      qSession.dropboxRefreshToken ?? null,
    );
    for (const manifestPath of paths) {
      workQueue.push({
        kind: "db",
        queueOwnerSessionId: qSid,
        queueRoot: rootPath,
        manifestPath,
      });
    }
  }

  let processedThisTick = 0;
  let lastHeartbeatId: string | undefined;

  for (const work of workQueue) {
    if (processedThisTick >= maxPerTick) break;

    if (work.kind === "fs") {
      const { manifestPath, manifest } = work.entry;
      if (!tryAcquireLock(manifestPath)) continue;

      const root = getPythonQueueRoot();
      if (!root) {
        releaseLock(manifestPath);
        continue;
      }

      const mid = manifestId(manifest, manifestPath);

      try {
        lastHeartbeatId = `python:${mid}`;
        writeHeartbeat(lastHeartbeatId);
        loadSessions();

        const sessionId =
          manifest.sessionId?.trim() || process.env.PYTHON_SESSION_ID?.trim();
        if (!sessionId) {
          workerLog.error(
            "Python manifest queue: set PYTHON_SESSION_ID or sessionId in manifest",
            { manifestId: mid },
          );
          moveManifestToFailed(
            manifestPath,
            "missing_session: set PYTHON_SESSION_ID or sessionId in manifest",
          );
          processedThisTick++;
          continue;
        }

        const session = getSession(sessionId);
        if (!session?.authenticated || !session.tokens) {
          workerLog.error(
            "Python manifest queue: session not authenticated",
            { manifestId: mid, sessionId },
          );
          moveManifestToFailed(manifestPath, "session_not_authenticated");
          processedThisTick++;
          continue;
        }

        if (uploadedTitles) {
          const t = manifest.title.toLowerCase().trim();
          if (t && uploadedTitles.has(t)) {
            workerLog.info("Python manifest queue: skipping duplicate title", {
              manifestId: mid,
              title: manifest.title,
            });
            moveManifestToProcessed(manifestPath);
            processedThisTick++;
            continue;
          }
        }

        const videoAbs = resolveUnderQueueRoot(root, manifest.videoPath);
        if (!videoAbs || !fs.existsSync(videoAbs)) {
          workerLog.warn("Python manifest queue: video file missing", {
            manifestId: mid,
            videoPath: videoAbs,
          });
          moveManifestToFailed(
            manifestPath,
            `video_missing: ${videoAbs || manifest.videoPath}`,
          );
          processedThisTick++;
          continue;
        }

        let thumbAbs: string | undefined;
        if (manifest.thumbnailPath?.trim()) {
          const tp = resolveUnderQueueRoot(root, manifest.thumbnailPath);
          if (tp && fs.existsSync(tp)) {
            thumbAbs = tp;
          }
        }

        const item: UploadTask["item"] = {
          file: {
            name: path.basename(videoAbs),
            path: videoAbs,
          },
          title: manifest.title,
          description: manifest.description,
          privacyStatus: manifest.privacyStatus,
          publishDate: manifest.publishDate,
          madeForKids: manifest.madeForKids,
          ...(thumbAbs ? { thumbnailPath: thumbAbs } : {}),
        };

        const task: UploadTask = { index: 0, item };

        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);

        const youtube = google.youtube({
          version: "v3",
          auth: oAuthClient,
        });

        const dropboxToken = await getDropboxToken(
          session.dropboxToken,
          session.dropboxRefreshToken,
          sessionId,
        );

        const sendProgress = (
          index: number,
          status: string,
          vid?: string,
          err?: string,
          duration?: number,
        ) => {
          workerLog.info(status, {
            source: "python-manifest",
            manifestId: mid,
            index,
            videoId: vid,
            error: err,
            duration,
          });
        };

        const result = await workerUploadVideo(
          youtube,
          task,
          sendProgress,
          oAuthClient,
          dropboxToken,
          sessionId,
          session.dropboxRefreshToken ?? null,
        );

        if (result.success && result.videoId) {
          appendUploadedVideo({
            videoId: result.videoId,
            title: manifest.title,
            jobId: `python-manifest:${mid}`,
            uploadedAt: new Date().toISOString(),
          });
          moveManifestToProcessed(manifestPath);
          workerLog.info("Python manifest queue: uploaded", {
            manifestId: mid,
            videoId: result.videoId,
          });
        } else {
          moveManifestToFailed(manifestPath, result.error || "upload_failed");
          workerLog.error("Python manifest queue: upload failed", {
            manifestId: mid,
            error: result.error,
          });
        }

        processedThisTick++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        workerLog.error("Python manifest queue: unexpected error", {
          manifestId: mid,
          error: msg,
        });
        try {
          moveManifestToFailed(manifestPath, msg);
        } catch {
          // ignore move errors
        }
        processedThisTick++;
      } finally {
        releaseLock(manifestPath);
      }
      continue;
    }

    const { queueOwnerSessionId, queueRoot, manifestPath } = work;
    const lockKey = dropboxPythonLockKey(queueOwnerSessionId, manifestPath);
    if (!tryAcquireDropboxPythonLock(lockKey)) continue;

    const qSession = getSession(queueOwnerSessionId);
    if (!qSession?.authenticated || !qSession.tokens) {
      releaseDropboxPythonLock(lockKey);
      continue;
    }

    const qToken = await getDropboxToken(
      qSession.dropboxToken,
      qSession.dropboxRefreshToken,
      queueOwnerSessionId,
    );
    if (!qToken) {
      releaseDropboxPythonLock(lockKey);
      continue;
    }

    try {
      const manifest = await downloadAndParseManifest(
        manifestPath,
        qToken,
        queueOwnerSessionId,
        qSession.dropboxRefreshToken ?? null,
      );
      if (!manifest) {
        await moveDropboxManifestToFailed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        processedThisTick++;
        continue;
      }

      const mid = manifestId(manifest, manifestPath);
      lastHeartbeatId = `python:${mid}`;
      writeHeartbeat(lastHeartbeatId);
      loadSessions();

      const uploadSessionId =
        manifest.sessionId?.trim() || process.env.PYTHON_SESSION_ID?.trim();
      if (!uploadSessionId) {
        workerLog.error(
          "Python manifest queue (Dropbox): set PYTHON_SESSION_ID or sessionId in manifest",
          { manifestId: mid },
        );
        await moveDropboxManifestToFailed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        processedThisTick++;
        continue;
      }

      const uploadSession = getSession(uploadSessionId);
      if (!uploadSession?.authenticated || !uploadSession.tokens) {
        workerLog.error(
          "Python manifest queue (Dropbox): session not authenticated",
          { manifestId: mid, sessionId: uploadSessionId },
        );
        await moveDropboxManifestToFailed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        processedThisTick++;
        continue;
      }

      if (uploadedTitles) {
        const t = manifest.title.toLowerCase().trim();
        if (t && uploadedTitles.has(t)) {
          workerLog.info(
            "Python manifest queue (Dropbox): skipping duplicate title",
            { manifestId: mid, title: manifest.title },
          );
          await moveDropboxManifestToProcessed(
            manifestPath,
            queueRoot,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
          processedThisTick++;
          continue;
        }
      }

      const videoOk = await dropboxVideoExists(
        queueRoot,
        manifest.videoPath,
        qToken,
        queueOwnerSessionId,
        qSession.dropboxRefreshToken ?? null,
      );
      if (!videoOk) {
        workerLog.warn("Python manifest queue (Dropbox): video missing", {
          manifestId: mid,
          videoPath: manifest.videoPath,
        });
        await moveDropboxManifestToFailed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        processedThisTick++;
        continue;
      }

      const videoDropboxPath = resolveDropboxVideoPath(
        queueRoot,
        manifest.videoPath,
      );
      let thumbDropbox: string | undefined;
      if (manifest.thumbnailPath?.trim()) {
        const tp = resolveDropboxThumbnailPath(
          queueRoot,
          manifest.thumbnailPath,
        );
        try {
          await getDropboxFileMetadata(
            tp,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
          thumbDropbox = tp;
        } catch {
          thumbDropbox = undefined;
        }
      }

      const item: UploadTask["item"] = {
        dropboxFileId: videoDropboxPath,
        title: manifest.title,
        description: manifest.description,
        privacyStatus: manifest.privacyStatus,
        publishDate: manifest.publishDate,
        madeForKids: manifest.madeForKids,
        ...(thumbDropbox ? { dropboxThumbnailId: thumbDropbox } : {}),
      };

      const task: UploadTask = { index: 0, item };

      const oAuthClient = getOAuthClient();
      oAuthClient.setCredentials(uploadSession.tokens);

      const youtube = google.youtube({
        version: "v3",
        auth: oAuthClient,
      });

      const sendProgress = (
        index: number,
        status: string,
        vid?: string,
        err?: string,
        duration?: number,
      ) => {
        workerLog.info(status, {
          source: "python-manifest-dropbox",
          manifestId: mid,
          index,
          videoId: vid,
          error: err,
          duration,
        });
      };

      const result = await workerUploadVideo(
        youtube,
        task,
        sendProgress,
        oAuthClient,
        qToken,
        queueOwnerSessionId,
        qSession.dropboxRefreshToken ?? null,
      );

      if (result.success && result.videoId) {
        appendUploadedVideo({
          videoId: result.videoId,
          title: manifest.title,
          jobId: `python-manifest:${mid}`,
          uploadedAt: new Date().toISOString(),
        });
        await moveDropboxManifestToProcessed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        workerLog.info("Python manifest queue (Dropbox): uploaded", {
          manifestId: mid,
          videoId: result.videoId,
        });
      } else {
        await moveDropboxManifestToFailed(
          manifestPath,
          queueRoot,
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        workerLog.error("Python manifest queue (Dropbox): upload failed", {
          manifestId: mid,
          error: result.error,
        });
      }

      processedThisTick++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workerLog.error("Python manifest queue (Dropbox): unexpected error", {
        manifestPath,
        error: msg,
      });
      try {
        if (qToken) {
          await moveDropboxManifestToFailed(
            manifestPath,
            queueRoot,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
        }
      } catch {
        // ignore
      }
      processedThisTick++;
    } finally {
      releaseDropboxPythonLock(lockKey);
    }
  }

  return lastHeartbeatId;
}
