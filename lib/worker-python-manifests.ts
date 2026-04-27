import fs from "fs";
import path from "path";
import { google } from "googleapis";
import {
  appendUploadedVideo,
  getUploadedTitlesSet,
  wasManifestJobUploadedTodayUtc,
} from "./uploaded-videos";
import { getSession, loadSessions } from "./session";
import { getOAuthClient, getDropboxToken } from "./auth";
import {
  getPythonQueueRoot,
  isPythonQueueEnabled,
  listPendingManifestsSorted,
  manifestId,
  moveManifestToProcessed,
  normalizeManifest,
  releaseLock,
  resolveUnderQueueRoot,
  tryAcquireLock,
  type ParsedManifestEntry,
  type PythonManifest,
} from "./python-queue";
import { getAllDropboxPythonQueueSessions } from "./queue-source";
import {
  listManifestJsonPathsSortedDropbox,
  downloadAndParseManifest,
  mergeManifestJsonOnDropbox,
  moveDropboxManifestToProcessed,
  moveDropboxManifestToFailed,
  resolveDropboxVideoPath,
  resolveDropboxThumbnailPath,
  dropboxVideoExists,
} from "./python-queue-dropbox";
import {
  mergeManifestJobPatchOnFs,
  recordManifestUploadFailureOnDropbox,
  recordManifestUploadFailureOnFs,
  shouldWorkerProcessManifest,
} from "./manifest-job-state";
import { workerLog } from "./worker-logger";
import { writeHeartbeat } from "./worker-health";
import { getDropboxFileMetadata } from "./dropbox";
import { getPythonManifestDailySlotsRemaining } from "./server-upload-schedule";
import type { UploadTask } from "./worker-upload";
import { workerUploadVideo } from "./worker-upload";
import { getVideoDurationSeconds } from "./video-duration";
import {
  formatCommentPostError,
  getManifestTopComment,
  isManifestCommentAlreadyPosted,
  postTopLevelComment,
} from "./youtube-comments";

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

function pickCommentMetaFromPatch(patch: Record<string, unknown>): {
  commentStatus?: "pending" | "posted" | "failed" | "skipped";
  commentPosted?: boolean;
  commentError?: string;
} {
  const commentStatusRaw = patch.comment_status;
  const commentStatus =
    commentStatusRaw === "pending" ||
    commentStatusRaw === "posted" ||
    commentStatusRaw === "failed" ||
    commentStatusRaw === "skipped"
      ? commentStatusRaw
      : undefined;
  const commentPosted =
    typeof patch.comment_posted === "boolean" ? patch.comment_posted : undefined;
  const commentError =
    typeof patch.comment_last_error === "string" && patch.comment_last_error.trim()
      ? patch.comment_last_error
      : undefined;
  return {
    commentStatus,
    commentPosted,
    commentError,
  };
}

async function buildManifestCommentPatch(
  youtube: ReturnType<typeof google.youtube>,
  manifest: PythonManifest,
  videoId: string,
  logContext: {
    source: "python-manifest" | "python-manifest-dropbox";
    manifestId: string;
  },
): Promise<Record<string, unknown>> {
  const commentText = getManifestTopComment(manifest);
  if (!commentText) {
    return {
      comment_status: "skipped",
      comment_posted: false,
      comment_last_error: "",
    };
  }

  if (isManifestCommentAlreadyPosted(manifest)) {
    return {
      comment_status: "posted",
      comment_posted: true,
      comment_last_error: "",
    };
  }

  try {
    const posted = await postTopLevelComment(youtube, videoId, commentText);
    workerLog.info("Python manifest queue: posted top-level comment", {
      ...logContext,
      videoId,
      commentId: posted.commentId,
    });
    return {
      comment_status: "posted",
      comment_posted: true,
      comment_last_error: "",
    };
  } catch (error: unknown) {
    const msg = formatCommentPostError(error);
    workerLog.warn("Python manifest queue: comment post failed (upload kept as done)", {
      ...logContext,
      videoId,
      error: msg,
    });
    return {
      comment_status: "failed",
      comment_posted: false,
      comment_last_error: msg,
    };
  }
}

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

  /** null = no UTC daily cap; otherwise decremented after each successful upload this tick */
  let dailyUploadSlotsLeft = getPythonManifestDailySlotsRemaining();

  const skipDupes = process.env.PYTHON_SKIP_DUPLICATE_TITLES === "true";
  const uploadedTitles = skipDupes ? getUploadedTitlesSet() : null;

  const workQueue: PythonWorkItem[] = [];
  if (isPythonQueueEnabled()) {
    const root = getPythonQueueRoot();
    if (root) {
      for (const entry of listPendingManifestsSorted()) {
        if (!shouldWorkerProcessManifest(entry.manifest)) continue;
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
      let fsUploadSucceeded = false;

      try {
        lastHeartbeatId = `python:${mid}`;
        writeHeartbeat(lastHeartbeatId);
        loadSessions();

        // Check duration before normalizing so Shorts > 60 s are downgraded.
        let fsDuration: number | null = null;
        {
          const earlyPath = resolveUnderQueueRoot(root, manifest.videoPath);
          if (earlyPath && fs.existsSync(earlyPath)) {
            fsDuration = await getVideoDurationSeconds(earlyPath);
          }
        }
        const normalizedManifest = normalizeManifest(manifest, fsDuration);
        if (normalizedManifest.shortDowngraded) {
          workerLog.warn("Python manifest queue: Short downgraded — video exceeds 60 s, uploading as regular video", {
            manifestId: mid,
            durationSeconds: fsDuration,
          });
        }

        const sessionId =
          manifest.sessionId?.trim() || process.env.PYTHON_SESSION_ID?.trim();
        if (!sessionId) {
          workerLog.error(
            "Python manifest queue: set PYTHON_SESSION_ID or sessionId in manifest",
            { manifestId: mid },
          );
          recordManifestUploadFailureOnFs(
            manifestPath,
            manifest,
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
          recordManifestUploadFailureOnFs(
            manifestPath,
            manifest,
            "session_not_authenticated",
          );
          processedThisTick++;
          continue;
        }

        if (uploadedTitles) {
          const t = normalizedManifest.title.toLowerCase().trim();
          if (t && uploadedTitles.has(t)) {
            workerLog.info("Python manifest queue: skipping duplicate title", {
              manifestId: mid,
              title: normalizedManifest.title,
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
          recordManifestUploadFailureOnFs(
            manifestPath,
            manifest,
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
          title: normalizedManifest.title,
          description: normalizedManifest.description,
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

        if (dailyUploadSlotsLeft !== null && dailyUploadSlotsLeft <= 0) {
          workerLog.info(
            "Python manifest queue: UTC daily upload cap reached; deferring",
            { manifestId: mid },
          );
          break;
        }

        const jobId = `python-manifest:${mid}`;
        if (wasManifestJobUploadedTodayUtc(jobId)) {
          workerLog.info(
            "Python manifest queue: already uploaded today; marking done and skipping",
            { manifestId: mid },
          );
          fsUploadSucceeded = true;
          const existingVideoId =
            typeof manifest.youtube_video_id === "string" &&
            manifest.youtube_video_id.trim()
              ? manifest.youtube_video_id.trim()
              : "";
          const patch: Record<string, unknown> = { upload_status: "done" };
          if (existingVideoId) {
            Object.assign(
              patch,
              await buildManifestCommentPatch(
                youtube,
                manifest,
                existingVideoId,
                {
                  source: "python-manifest",
                  manifestId: mid,
                },
              ),
            );
          }
          try {
            mergeManifestJobPatchOnFs(manifestPath, patch);
          } catch { /* best effort */ }
          try {
            moveManifestToProcessed(manifestPath);
          } catch { /* best effort */ }
          processedThisTick++;
          continue;
        }

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
          fsUploadSucceeded = true;
          if (dailyUploadSlotsLeft !== null) {
            dailyUploadSlotsLeft--;
          }
          const patch: Record<string, unknown> = {
            upload_status: "done",
            youtube_video_id: result.videoId,
          };
          Object.assign(
            patch,
            await buildManifestCommentPatch(
              youtube,
              manifest,
              result.videoId,
              {
                source: "python-manifest",
                manifestId: mid,
              },
            ),
          );
          const commentMeta = pickCommentMetaFromPatch(patch);
          appendUploadedVideo({
            videoId: result.videoId,
            title: normalizedManifest.title,
            jobId,
            uploadedAt: new Date().toISOString(),
            channelId: result.channelId,
            videoType: normalizedManifest.videoType,
            isShort: normalizedManifest.isShort,
            commentStatus: commentMeta.commentStatus,
            commentPosted: commentMeta.commentPosted,
            commentError: commentMeta.commentError,
          });
          try {
            mergeManifestJobPatchOnFs(manifestPath, patch);
          } catch { /* best effort — move will clean up */ }
          try {
            moveManifestToProcessed(manifestPath);
          } catch (moveErr: unknown) {
            workerLog.warn("Python manifest queue: uploaded but could not move to processed", {
              manifestId: mid,
              error: moveErr instanceof Error ? moveErr.message : String(moveErr),
            });
          }
          workerLog.info("Python manifest queue: uploaded", {
            manifestId: mid,
            videoId: result.videoId,
          });
        } else {
          recordManifestUploadFailureOnFs(
            manifestPath,
            manifest,
            result.error || "upload_failed",
          );
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
        if (!fsUploadSucceeded) {
          try {
            recordManifestUploadFailureOnFs(manifestPath, manifest, msg);
          } catch {
            // ignore patch errors
          }
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

    let dbUploadSucceeded = false;

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

      if (!shouldWorkerProcessManifest(manifest)) {
        // Already done or terminally failed — move out of the queue so it isn't
        // re-downloaded every tick.
        try {
          await moveDropboxManifestToProcessed(
            manifestPath,
            queueRoot,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
          workerLog.info("Python manifest queue (Dropbox): moving already-terminal manifest to processed", {
            manifestPath,
            upload_status: manifest.upload_status,
            retry_count: manifest.retry_count,
          });
        } catch {
          // best effort — will retry next tick
        }
        releaseDropboxPythonLock(lockKey);
        continue;
      }

      const mid = manifestId(manifest, manifestPath);
      const normalizedManifest = normalizeManifest(manifest);
      lastHeartbeatId = `python:${mid}`;
      writeHeartbeat(lastHeartbeatId);
      loadSessions();

      /** Same session that registered this Dropbox queue almost always owns YouTube too. */
      const uploadSessionId =
        manifest.sessionId?.trim() ||
        process.env.PYTHON_SESSION_ID?.trim() ||
        queueOwnerSessionId;
      if (!uploadSessionId) {
        workerLog.error(
          "Python manifest queue (Dropbox): no session for upload (manifest sessionId, PYTHON_SESSION_ID, or queue owner)",
          { manifestId: mid },
        );
        await recordManifestUploadFailureOnDropbox(
          manifestPath,
          manifest,
          "no_session: set sessionId in manifest, PYTHON_SESSION_ID, or use queue owner session",
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
        await recordManifestUploadFailureOnDropbox(
          manifestPath,
          manifest,
          "session_not_authenticated",
          qToken,
          queueOwnerSessionId,
          qSession.dropboxRefreshToken ?? null,
        );
        processedThisTick++;
        continue;
      }

      if (uploadedTitles) {
        const t = normalizedManifest.title.toLowerCase().trim();
        if (t && uploadedTitles.has(t)) {
          workerLog.info(
            "Python manifest queue (Dropbox): skipping duplicate title",
            { manifestId: mid, title: normalizedManifest.title },
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
        await recordManifestUploadFailureOnDropbox(
          manifestPath,
          manifest,
          `video_missing: ${manifest.videoPath}`,
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
        title: normalizedManifest.title,
        description: normalizedManifest.description,
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

      if (dailyUploadSlotsLeft !== null && dailyUploadSlotsLeft <= 0) {
        workerLog.info(
          "Python manifest queue (Dropbox): UTC daily upload cap reached; deferring",
          { manifestId: mid },
        );
        break;
      }

      const dbJobId = `python-manifest:${mid}`;
      if (wasManifestJobUploadedTodayUtc(dbJobId)) {
        workerLog.info(
          "Python manifest queue (Dropbox): already uploaded today; marking done and skipping",
          { manifestId: mid },
        );
        const existingVideoId =
          typeof manifest.youtube_video_id === "string" &&
          manifest.youtube_video_id.trim()
            ? manifest.youtube_video_id.trim()
            : "";
        const patch: Record<string, unknown> = { upload_status: "done" };
        if (existingVideoId) {
          Object.assign(
            patch,
            await buildManifestCommentPatch(
              youtube,
              manifest,
              existingVideoId,
              {
                source: "python-manifest-dropbox",
                manifestId: mid,
              },
            ),
          );
        }
        try {
          await mergeManifestJsonOnDropbox(
            manifestPath,
            patch,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
        } catch { /* best effort */ }
        try {
          await moveDropboxManifestToProcessed(
            manifestPath,
            queueRoot,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
        } catch { /* best effort */ }
        processedThisTick++;
        continue;
      }

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
        dbUploadSucceeded = true;
        if (dailyUploadSlotsLeft !== null) {
          dailyUploadSlotsLeft--;
        }
        const patch: Record<string, unknown> = {
          upload_status: "done",
          youtube_video_id: result.videoId,
        };
        Object.assign(
          patch,
          await buildManifestCommentPatch(
            youtube,
            manifest,
            result.videoId,
            {
              source: "python-manifest-dropbox",
              manifestId: mid,
            },
          ),
        );
        const commentMeta = pickCommentMetaFromPatch(patch);
        appendUploadedVideo({
          videoId: result.videoId,
          title: normalizedManifest.title,
          jobId: dbJobId,
          uploadedAt: new Date().toISOString(),
          channelId: result.channelId,
          videoType: normalizedManifest.videoType,
          isShort: normalizedManifest.isShort,
          commentStatus: commentMeta.commentStatus,
          commentPosted: commentMeta.commentPosted,
          commentError: commentMeta.commentError,
        });
        try {
          await mergeManifestJsonOnDropbox(
            manifestPath,
            patch,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
        } catch { /* best effort — move will clean up */ }
        try {
          await moveDropboxManifestToProcessed(
            manifestPath,
            queueRoot,
            qToken,
            queueOwnerSessionId,
            qSession.dropboxRefreshToken ?? null,
          );
        } catch (moveErr: unknown) {
          workerLog.warn("Python manifest queue (Dropbox): uploaded but could not move to processed", {
            manifestId: mid,
            error: moveErr instanceof Error ? moveErr.message : String(moveErr),
          });
        }
        workerLog.info("Python manifest queue (Dropbox): uploaded", {
          manifestId: mid,
          videoId: result.videoId,
        });
      } else {
        await recordManifestUploadFailureOnDropbox(
          manifestPath,
          manifest,
          result.error || "upload_failed",
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
      if (!dbUploadSucceeded) {
        try {
          if (qToken) {
            const m = await downloadAndParseManifest(
              manifestPath,
              qToken,
              queueOwnerSessionId,
              qSession.dropboxRefreshToken ?? null,
            );
            if (m) {
              await recordManifestUploadFailureOnDropbox(
                manifestPath,
                m,
                msg,
                qToken,
                queueOwnerSessionId,
                qSession.dropboxRefreshToken ?? null,
              );
            }
          }
        } catch {
          // ignore
        }
      }
      processedThisTick++;
    } finally {
      releaseDropboxPythonLock(lockKey);
    }
  }

  /* Do not return lastHeartbeatId: worker.ts re-writes heartbeat each tick; returning
   * python:* would keep jobId set forever so the dashboard shows Uploading: 1 when idle. */
  return undefined;
}
