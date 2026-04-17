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
      <div className="mb-4 h-16 rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800/80 shadow-sm animate-pulse" />
    );
  }

  if (!data.enabled) {
    const msg = data.dropboxConfigured
      ? `Dropbox folder saved (${data.dropboxRootPath ?? "—"}) — connect Dropbox to activate.`
      : "Not configured. Set PYTHON_QUEUE_ROOT or pick a Dropbox bot folder in Upload Videos.";
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/50 px-4 py-3.5 text-sm text-gray-600 dark:text-gray-400 shadow-sm">
        <span className="text-lg shrink-0" aria-hidden>🐍</span>
        <span>{msg}</span>
      </div>
    );
  }

  const pending = data.pending.length;
  const pythonLockedCount = data.pending.filter((p) => p.locked).length;
  const workerRecent =
    !!workerHeartbeat &&
    Date.now() - new Date(workerHeartbeat.lastRunAt).getTime() < 2 * 60 * 1000;
  const heartbeatPython =
    (workerHeartbeat?.jobId?.startsWith("python:") ?? false) && workerRecent;
  const pythonActive = pythonLockedCount > 0 || heartbeatPython;

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
    <div className="mb-4 rounded-2xl border border-violet-200/90 dark:border-violet-800/80 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/40 dark:from-violet-950/40 dark:via-gray-950 dark:to-fuchsia-950/20 shadow-md shadow-violet-900/5 dark:shadow-black/40 ring-1 ring-violet-100/80 dark:ring-violet-900/40 overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-violet-100/90 dark:border-violet-900/50 bg-white/40 dark:bg-gray-950/30 backdrop-blur-[2px]">
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
          {pythonActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs px-2 py-0.5 font-medium">
              <span className="relative flex h-2 w-2">
                {(heartbeatPython || workerRecent) && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
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
          {pending > 0 && !heartbeatPython && nextTickLabel && (
            <span className="text-[11px] text-violet-400 dark:text-violet-500">
              · {nextTickLabel}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-violet-100/60 dark:bg-violet-950/50 p-px text-center">
        <Stat
          value={pending}
          label="Pending"
          tone="violet"
          color={pending > 0 ? "text-violet-700 dark:text-violet-300" : undefined}
        />
        <Stat tone="sky" value={data.uploadsTodayUtc} label="Today (UTC)" />
        <Stat
          tone="emerald"
          value={data.processedCount}
          label="Done"
          color="text-emerald-700 dark:text-emerald-300"
          suffix={
            <span className="text-rose-500 dark:text-rose-400 text-xs ml-1 font-semibold tabular-nums">
              / {data.failedCount} fail
            </span>
          }
        />

        {/* Daily limit cell with reset countdown */}
        <div className="py-2.5 px-2 bg-white/90 dark:bg-gray-950/70">
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
        <div className={`px-4 py-2.5 border-t border-violet-100/90 dark:border-violet-900/50 text-[11px] leading-snug bg-white/50 dark:bg-gray-950/40 ${capReached ? "text-rose-600 dark:text-rose-400" : "text-gray-500 dark:text-gray-400"}`}>
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

const statToneClass: Record<
  "neutral" | "violet" | "sky" | "emerald",
  string
> = {
  neutral: "bg-white/90 dark:bg-gray-950/70",
  violet: "bg-violet-50/90 dark:bg-violet-950/35",
  sky: "bg-sky-50/80 dark:bg-sky-950/25",
  emerald: "bg-emerald-50/70 dark:bg-emerald-950/25",
};

function Stat({
  value,
  label,
  color,
  suffix,
  tone = "neutral",
}: {
  value: number;
  label: string;
  color?: string;
  suffix?: React.ReactNode;
  tone?: keyof typeof statToneClass;
}) {
  return (
    <div className={`py-2.5 px-2 ${statToneClass[tone]}`}>
      <div className={`text-xl font-bold tabular-nums tracking-tight ${color ?? "text-gray-800 dark:text-gray-200"}`}>
        {value}
        {suffix}
      </div>
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}
