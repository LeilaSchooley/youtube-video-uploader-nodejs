"use client";

import type { PythonQueueData } from "./types";

interface PythonQueuePanelProps {
  /** Null only before first successful fetch from parent */
  data: PythonQueueData | null;
  workerHeartbeat?: { lastRunAt: string; jobId?: string } | null;
}

function formatTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function PythonQueuePanel({
  data,
  workerHeartbeat,
}: PythonQueuePanelProps) {
  if (!data) {
    return (
      <div className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
        Loading Python manifest queue status…
      </div>
    );
  }

  if (!data.enabled) {
    if (data.dropboxConfigured) {
      return (
        <div className="mb-6 p-4 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30">
          <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Python manifest queue (Dropbox)
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            A Dropbox bot folder is saved
            {data.dropboxRootPath ? (
              <>
                {" "}
                (<span className="font-mono text-xs">{data.dropboxRootPath}</span>
                )
              </>
            ) : null}
            , but Dropbox is not connected for this browser session. Connect
            Dropbox under Upload Videos, then refresh.
          </p>
        </div>
      );
    }
    return (
      <div className="mb-6 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40">
        <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Python manifest queue
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Not configured. Either set{" "}
          <code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">
            PYTHON_QUEUE_ROOT
          </code>{" "}
          on the server for a local{" "}
          <code className="text-xs">manifests/</code> folder, or pick a Dropbox
          folder with <code className="text-xs">manifests/</code>,{" "}
          <code className="text-xs">videos/</code>, and{" "}
          <code className="text-xs">thumbnails/</code> in Upload Videos (worker
          reads manifests from Dropbox).
        </p>
      </div>
    );
  }

  const pending = data.pending.length;
  const pythonActive =
    workerHeartbeat?.jobId?.startsWith("python:") ?? false;
  const hbRecent =
    workerHeartbeat &&
    Date.now() - new Date(workerHeartbeat.lastRunAt).getTime() <
      2 * 60 * 1000;

  return (
    <div className="mb-6 rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-100 dark:border-violet-900/50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span aria-hidden>🐍</span>
            Python manifest queue
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Bot drops JSON + video files; worker uploads alongside bulk jobs (
            {data.source === "dropbox" || data.source === "both" ? (
              <>
                Dropbox root{" "}
                <span className="font-mono">
                  {data.dropboxRootPath || data.queueRootLabel}
                </span>
                {data.source === "both"
                  ? "; also local PYTHON_QUEUE_ROOT if set"
                  : null}
              </>
            ) : (
              <>
                folder: <span className="font-mono">{data.queueRootLabel}</span>
              </>
            )}
            ).
          </p>
        </div>
        {pending > 0 && (
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              pythonActive && hbRecent
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            }`}
          >
            {pythonActive && hbRecent
              ? "Worker on manifest job"
              : `${pending} waiting in manifests/`}
          </span>
        )}
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="rounded-lg bg-white dark:bg-gray-800/80 p-3 border border-gray-100 dark:border-gray-700">
          <div className="text-2xl font-bold text-violet-700 dark:text-violet-300">
            {pending}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Pending manifests
          </div>
        </div>
        <div className="rounded-lg bg-white dark:bg-gray-800/80 p-3 border border-gray-100 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {data.uploadsTodayUtc}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Uploaded today (UTC)
          </div>
        </div>
        <div className="rounded-lg bg-white dark:bg-gray-800/80 p-3 border border-gray-100 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {data.maxPerTick}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Max per worker tick
          </div>
        </div>
        <div className="rounded-lg bg-white dark:bg-gray-800/80 p-3 border border-gray-100 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {data.processedCount}
            <span className="text-gray-400 font-normal mx-1">/</span>
            <span className="text-rose-600 dark:text-rose-400">
              {data.failedCount}
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Processed / failed (files on disk)
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span>
          Duplicate titles:{" "}
          <strong>{data.skipDuplicateTitles ? "skip" : "off"}</strong>
        </span>
        <span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
            PYTHON_SESSION_ID
          </code>
          :{" "}
          <strong>
            {data.sessionIdEnvConfigured ? "set" : "not set (use manifest or env)"}
          </strong>
        </span>
        {workerHeartbeat && (
          <span title={workerHeartbeat.lastRunAt}>
            Worker heartbeat: {formatTimeAgo(workerHeartbeat.lastRunAt)}
            {workerHeartbeat.jobId && (
              <span className="ml-1 font-mono opacity-80">
                ({workerHeartbeat.jobId.slice(0, 24)}
                {workerHeartbeat.jobId.length > 24 ? "…" : ""})
              </span>
            )}
          </span>
        )}
      </div>

      {data.pending.length > 0 && (
        <div className="border-t border-violet-100 dark:border-violet-900/50 max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-violet-50/80 dark:bg-violet-950/30 text-left text-xs uppercase text-gray-500 dark:text-gray-400 sticky top-0">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-2 py-2 w-20">Priority</th>
                <th className="px-2 py-2 w-24">Video file</th>
                <th className="px-2 py-2 w-20">Lock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.pending.map((row) => (
                <tr
                  key={row.fileName}
                  className="hover:bg-white/50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-md" title={row.title}>
                    {row.title}
                  </td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                    {row.priority}
                  </td>
                  <td className="px-2 py-2">
                    {row.videoReady ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Ready</span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">Missing</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-600 dark:text-gray-400">
                    {row.locked ? "Held" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
        Python uploads do not use &quot;videos per day&quot; like bulk jobs; throughput is
        roughly{" "}
        <strong>
          up to {data.maxPerTick} manifest(s) every ~5s
        </strong>{" "}
        while the worker is running (plus bulk queue work). Tune{" "}
        <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
          PYTHON_QUEUE_MAX_PER_TICK
        </code>
        .
      </div>
    </div>
  );
}
