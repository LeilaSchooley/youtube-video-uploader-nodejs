"use client";

import { useEffect, useState } from "react";
import type { PythonQueueData } from "./types";

interface PythonQueuePanelProps {
  data: PythonQueueData | null;
  workerHeartbeat?: { lastRunAt: string; jobId?: string } | null;
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useTickAgo(iso: string | undefined) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!iso) { setLabel(""); return; }
    const tick = () => {
      const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (!Number.isFinite(sec)) { setLabel(""); return; }
      if (sec < 10) setLabel("just now");
      else if (sec < 60) setLabel(`${sec}s ago`);
      else if (sec < 3600) setLabel(`${Math.floor(sec / 60)}m ago`);
      else setLabel(`${Math.floor(sec / 3600)}h ago`);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [iso]);
  return label;
}

/** Returns "Xh Ym" until the next UTC midnight, ticking every minute. */
function useUtcMidnightCountdown() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      ));
      const ms = midnight.getTime() - Date.now();
      const totalMin = Math.floor(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);
  return label;
}

/**
 * Returns seconds until `lastRunAt + tickMs`, ticking every second.
 * Returns 0 when the next tick is overdue.
 */
function useNextTickCountdown(lastRunAt: string | undefined, tickMs = 5000) {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!lastRunAt) { setSecs(null); return; }
    const tick = () => {
      const next = new Date(lastRunAt).getTime() + tickMs;
      setSecs(Math.max(0, Math.ceil((next - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastRunAt, tickMs]);
  return secs;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PythonQueuePanel({
  data,
  workerHeartbeat,
}: PythonQueuePanelProps) {
  const heartbeatAgo = useTickAgo(workerHeartbeat?.lastRunAt);
  const resetIn = useUtcMidnightCountdown();
  const nextTickSecs = useNextTickCountdown(workerHeartbeat?.lastRunAt);

  if (!data) {
    return (
      <div className="mb-4 h-16 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 animate-pulse" />
    );
  }

  if (!data.enabled) {
    const msg = data.dropboxConfigured
      ? `Dropbox folder saved (${data.dropboxRootPath ?? "—"}) — connect Dropbox to activate.`
      : "Not configured. Set PYTHON_QUEUE_ROOT or pick a Dropbox bot folder in Upload Videos.";
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="text-lg shrink-0" aria-hidden>🐍</span>
        <span>{msg}</span>
      </div>
    );
  }

  const pending = data.pending.length;
  const pythonActive = workerHeartbeat?.jobId?.startsWith("python:") ?? false;
  const workerRecent =
    workerHeartbeat &&
    Date.now() - new Date(workerHeartbeat.lastRunAt).getTime() < 2 * 60 * 1000;

  const limit = data.manifestDailyLimit;
  const capEnabled = limit?.enabled ?? false;
  const capReached = capEnabled && (limit?.remainingToday ?? 1) === 0;

  // Queue-clear ETA string
  let clearEta: string | null = null;
  if (pending > 0 && data.maxPerTick > 0) {
    const ticksNeeded = Math.ceil(pending / data.maxPerTick);
    const totalSec = ticksNeeded * 5;
    if (capEnabled && limit) {
      const uploadable = limit.remainingToday;
      if (uploadable <= 0) {
        clearEta = `Cap reached — ${pending} pending will upload after UTC midnight`;
      } else if (uploadable < pending) {
        const partialSec = Math.ceil(uploadable / data.maxPerTick) * 5;
        clearEta = `${uploadable} upload${uploadable > 1 ? "s" : ""} remaining today (~${fmtSec(partialSec)}), rest after UTC midnight`;
      } else {
        clearEta = `~${fmtSec(totalSec)} to clear queue`;
      }
    } else {
      clearEta = `~${fmtSec(totalSec)} to clear queue`;
    }
  }

  const queuePath = data.dropboxRootPath || data.queueRootLabel || null;

  const nextTickLabel =
    nextTickSecs === null
      ? null
      : nextTickSecs === 0
        ? "next tick any moment"
        : `next tick ~${nextTickSecs}s`;

  return (
    <div className="mb-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50/80 to-white dark:from-violet-950/30 dark:to-gray-900 shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-violet-100 dark:border-violet-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0" aria-hidden>🐍</span>
          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
            Python manifest queue
          </span>
          {queuePath && (
            <span className="hidden sm:inline text-xs font-mono text-gray-400 dark:text-gray-500 truncate max-w-[220px]">
              {queuePath}
            </span>
          )}
        </div>

        {/* Live status pill + next-tick hint */}
        <div className="flex items-center gap-1.5 ml-auto">
          {pythonActive && workerRecent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs px-2 py-0.5 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Uploading
            </span>
          ) : workerRecent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 text-xs px-2 py-0.5 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
              </span>
              Worker running
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5">
              <span className="inline-flex rounded-full h-2 w-2 bg-gray-400" />
              Idle
            </span>
          )}
          {heartbeatAgo && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {heartbeatAgo}
            </span>
          )}
          {/* Next tick hint — only when there are pending and worker isn't actively uploading */}
          {pending > 0 && !pythonActive && nextTickLabel && (
            <span className="text-[11px] text-violet-400 dark:text-violet-500">
              · {nextTickLabel}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 divide-x divide-violet-100 dark:divide-violet-900/50 text-center">
        <Stat
          value={pending}
          label="Pending"
          color={pending > 0 ? "text-violet-700 dark:text-violet-300" : undefined}
        />
        <Stat value={data.uploadsTodayUtc} label="Today (UTC)" />
        <Stat
          value={data.processedCount}
          label="Done"
          color="text-emerald-700 dark:text-emerald-300"
          suffix={
            <span className="text-rose-500 dark:text-rose-400 text-xs ml-1">
              / {data.failedCount} fail
            </span>
          }
        />

        {/* Daily limit cell with reset countdown */}
        <div className="py-2 px-2">
          {capEnabled && limit ? (
            <>
              <div className={`text-sm font-semibold ${capReached ? "text-rose-600 dark:text-rose-400" : "text-gray-700 dark:text-gray-200"}`}>
                {limit.remainingToday}/{limit.videosPerDay} left today
              </div>
              <div className={`text-[11px] mt-0.5 leading-tight ${capReached ? "text-rose-500 dark:text-rose-400 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                {capReached ? `Resets in ${resetIn} ↺` : `Resets in ${resetIn}`}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No cap</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">Daily limit</div>
            </>
          )}
        </div>
      </div>

      {/* Queue clear ETA footer */}
      {clearEta && (
        <div className={`px-4 py-2 border-t border-violet-100 dark:border-violet-900/50 text-[11px] leading-snug ${capReached ? "text-rose-500 dark:text-rose-400" : "text-gray-400 dark:text-gray-500"}`}>
          {clearEta}
        </div>
      )}
    </div>
  );
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function Stat({
  value,
  label,
  color,
  suffix,
}: {
  value: number;
  label: string;
  color?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="py-2 px-2">
      <div className={`text-xl font-bold ${color ?? "text-gray-800 dark:text-gray-200"}`}>
        {value}
        {suffix}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}
