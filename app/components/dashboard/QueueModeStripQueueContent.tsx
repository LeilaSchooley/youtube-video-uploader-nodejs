"use client";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";

type Props = {
  dropboxAuthLoading: boolean;
  hasDropboxAuth: boolean | null;
  connectDropbox: () => Promise<void>;
  scanningDropbox: boolean;
  dropboxPythonQueue: boolean;
  queueRootPath: string | null;
  detectedQueuePath: string | null;
  detectedLayoutCounts: { manifestCount: number; videoCount: number; thumbnailCount: number } | null;
  layoutCounts: { manifestCount: number; videoCount: number; thumbnailCount: number } | null;
  py: any;
  notFoundReason: string | null;
  notFoundMessage: string;
  paused: boolean;
  hbRecent: boolean;
  hb: { lastRunAt: string; jobId?: string } | null;
  bulk: { pending: number; processing: number; completed: number; failed: number } | undefined;
  statusCounts: { queued?: number; uploading?: number; done?: number; failed?: number };
  actionLoading: boolean;
  onRefreshDetect: () => void;
  onUseDetectedQueue: () => Promise<void> | void;
  onChangeFolder: () => Promise<void>;
  onManualFolderSelect?: () => void;
  onPostAction: (path: "start" | "stop") => Promise<void>;
  onOpenQueueTab?: () => void;
};

export default function QueueModeStripQueueContent(props: Props) {
  return (
    <CardContent className="space-y-4 p-4">
      {props.dropboxAuthLoading ? (
        <p className="text-sm text-muted-foreground" role="status">Checking Dropbox connection…</p>
      ) : props.hasDropboxAuth !== true ? (
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/50 px-4 py-3.5 text-sm text-amber-950 shadow-md shadow-amber-900/5 dark:border-amber-800/80 dark:from-amber-950/40 dark:to-orange-950/20 dark:text-amber-100">
          <p className="mb-2 font-medium">Connect Dropbox to use Queue mode.</p>
          <Button type="button" size="sm" onClick={() => void props.connectDropbox()}>Connect Dropbox</Button>
        </div>
      ) : (
        <>
          {props.scanningDropbox && <p className="text-sm text-muted-foreground" role="status">Scanning Dropbox for queue…</p>}
          {props.dropboxPythonQueue && props.queueRootPath && !props.scanningDropbox ? (
            <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-teal-50/40 to-white px-4 py-3.5 text-sm text-emerald-950 shadow-md shadow-emerald-900/5 dark:border-emerald-800/70 dark:from-emerald-950/35 dark:via-teal-950/20 dark:to-gray-950/50 dark:text-emerald-100 ring-1 ring-emerald-100/80 dark:ring-emerald-900/40" role="status">
              <div className="font-semibold mb-1 flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" aria-hidden />
                Queue detected
              </div>
              <p className="font-mono text-xs break-all mb-2">{props.queueRootPath}</p>
              {props.layoutCounts && <p className="text-xs mb-1">Folder scan: <strong>{props.layoutCounts.manifestCount}</strong> manifests, <strong>{props.layoutCounts.videoCount}</strong> videos, <strong>{props.layoutCounts.thumbnailCount}</strong> thumbnails</p>}
              {props.py?.enabled ? <p className="text-xs">Ready to upload now: <strong>{props.py.videosReady ?? 0}</strong> with video on disk, <strong>{props.py.pending}</strong> manifest{props.py.pending === 1 ? "" : "s"} pending.</p> : <p className="text-xs opacity-90">Worker summary loads after the worker process polls this session.</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button type="button" variant="secondary" size="sm" disabled={props.scanningDropbox} onClick={props.onRefreshDetect}>Refresh scan</Button>
                <Button type="button" variant="outline" size="sm" disabled={props.scanningDropbox} onClick={() => void props.onChangeFolder()}>Change folder</Button>
              </div>
            </div>
          ) : null}
          {!props.dropboxPythonQueue && props.detectedQueuePath && !props.scanningDropbox ? (
            <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50 via-indigo-50/40 to-white px-4 py-3.5 text-sm text-blue-950 shadow-md shadow-blue-900/5 dark:border-blue-800/70 dark:from-blue-950/35 dark:via-indigo-950/20 dark:to-gray-950/50 dark:text-blue-100 ring-1 ring-blue-100/80 dark:ring-blue-900/40" role="status">
              <div className="font-semibold mb-1 flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" aria-hidden />
                Queue layout detected (not enabled yet)
              </div>
              <p className="font-mono text-xs break-all mb-2">{props.detectedQueuePath}</p>
              {props.detectedLayoutCounts && <p className="text-xs mb-2">Folder scan: <strong>{props.detectedLayoutCounts.manifestCount}</strong> manifests, <strong>{props.detectedLayoutCounts.videoCount}</strong> videos, <strong>{props.detectedLayoutCounts.thumbnailCount}</strong> thumbnails</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void props.onUseDetectedQueue()}>Use detected queue</Button>
                <Button type="button" size="sm" variant="secondary" onClick={props.onRefreshDetect}>Scan again</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void props.onChangeFolder()}>Select folder manually</Button>
              </div>
            </div>
          ) : null}
          {!props.dropboxPythonQueue && !props.scanningDropbox && props.notFoundReason ? (
            <div className="rounded-2xl border border-red-200/90 bg-gradient-to-br from-red-50 to-rose-50/50 px-4 py-3.5 text-sm text-red-950 shadow-md shadow-red-900/5 dark:border-red-900/70 dark:from-red-950/35 dark:to-rose-950/20 dark:text-red-100 ring-1 ring-red-100/70 dark:ring-red-900/30" role="alert">
              <div className="font-semibold mb-1">No queue found in Dropbox</div>
              <p className="text-xs mb-2">{props.notFoundMessage}</p>
              <p className="text-xs font-mono bg-black/5 dark:bg-white/10 p-2 rounded mb-2">/queue/<br />&nbsp;&nbsp;manifests/<br />&nbsp;&nbsp;videos/<br />&nbsp;&nbsp;thumbnails/</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={props.onRefreshDetect}>Scan again</Button>
                <Button type="button" size="sm" onClick={() => props.onManualFolderSelect?.()}>Select folder manually</Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm shadow-md ring-1 ${
          props.paused
            ? "border-amber-300/90 bg-gradient-to-br from-amber-50 to-orange-50/60 text-amber-950 shadow-amber-900/5 ring-amber-200/60 dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/20 dark:text-amber-100 dark:ring-amber-900/40"
            : props.hbRecent
              ? "border-emerald-300/90 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white text-emerald-950 shadow-emerald-900/5 ring-emerald-100/70 dark:border-emerald-800 dark:from-emerald-950/35 dark:via-teal-950/20 dark:to-gray-950/50 dark:text-emerald-100 dark:ring-emerald-900/35"
              : "border-gray-200/90 bg-gradient-to-br from-gray-50 to-slate-50/70 text-gray-800 shadow-gray-900/5 ring-gray-200/60 dark:border-gray-700 dark:from-gray-900/80 dark:to-slate-950/50 dark:text-gray-200 dark:ring-gray-800/50"
        }`}
        role="status"
      >
        <div className="font-semibold mb-1.5 flex items-center gap-2">
          <span className="text-lg" aria-hidden>⚙️</span>
          Continuous flow (worker)
        </div>
        {props.paused ? (
          <p className="leading-relaxed">
            <strong>Paused</strong> — the worker will not pick up Python manifests or bulk jobs until you click <strong>Start queue upload</strong>.
          </p>
        ) : props.hbRecent ? (
          <p className="leading-relaxed">
            <strong>Running</strong> — last worker tick <span className="font-mono text-xs opacity-90">{new Date(props.hb!.lastRunAt).toLocaleTimeString()}</span>.
          </p>
        ) : (
          <p className="leading-relaxed">
            <strong>Not paused</strong>, but <strong>no recent heartbeat</strong>. Run{" "}
            <code className="text-[11px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-md font-mono">npm run worker</code>.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {(
          [
            ["Queued", props.statusCounts.queued ?? "—", "slate"],
            ["Uploading", props.statusCounts.uploading ?? "—", "amber"],
            ["Done", props.statusCounts.done ?? "—", "emerald"],
            ["Failed", props.statusCounts.failed ?? "—", "rose"],
          ] as const
        ).map(([label, val, palette]) => (
          <div
            key={label}
            className={`rounded-xl border py-3.5 px-2 shadow-sm backdrop-blur-[1px] transition-[box-shadow,transform] duration-200 hover:shadow-md hover:-translate-y-0.5 ${
              palette === "slate"
                ? "border-slate-200/90 bg-gradient-to-b from-slate-50 to-white dark:border-slate-700 dark:from-slate-900/90 dark:to-gray-950/80"
                : palette === "amber"
                  ? "border-amber-200/90 bg-gradient-to-b from-amber-50/90 to-white dark:border-amber-900/50 dark:from-amber-950/30 dark:to-gray-950/80"
                  : palette === "emerald"
                    ? "border-emerald-200/90 bg-gradient-to-b from-emerald-50/90 to-white dark:border-emerald-900/45 dark:from-emerald-950/25 dark:to-gray-950/80"
                    : "border-rose-200/90 bg-gradient-to-b from-rose-50/90 to-white dark:border-rose-900/45 dark:from-rose-950/25 dark:to-gray-950/80"
            }`}
          >
            <div
              className={`text-2xl font-bold tabular-nums tracking-tight ${
                palette === "slate"
                  ? "text-slate-800 dark:text-slate-100"
                  : palette === "amber"
                    ? "text-amber-800 dark:text-amber-200"
                    : palette === "emerald"
                      ? "text-emerald-800 dark:text-emerald-200"
                      : "text-rose-800 dark:text-rose-200"
              }`}
            >
              {val}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" disabled={props.actionLoading || !props.paused} onClick={() => void props.onPostAction("start")} className="rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700">
          Start queue upload
        </Button>
        <Button type="button" variant="secondary" disabled={props.actionLoading || props.paused} onClick={() => void props.onPostAction("stop")} className="rounded-xl bg-amber-600 text-white shadow-sm shadow-amber-900/20 hover:bg-amber-700 border-0">
          Stop
        </Button>
        {props.paused ? (
          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Paused — no work runs until Start.</span>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Processing on — worker ticks every ~5s if running.</span>
        )}
        {props.onOpenQueueTab && (
          <Button type="button" variant="link" onClick={props.onOpenQueueTab} className="ml-auto text-violet-600 dark:text-violet-400">
            Queue &amp; Progress →
          </Button>
        )}
      </div>
      {props.bulk && (props.bulk.pending > 0 || props.bulk.processing > 0 || props.bulk.completed > 0 || props.bulk.failed > 0) && (
        <p className="text-xs text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200/80 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2">
          Bulk jobs: <strong>{props.bulk.pending}</strong> pending, <strong>{props.bulk.processing}</strong> uploading, <strong>{props.bulk.completed}</strong> completed, <strong>{props.bulk.failed}</strong> failed.
        </p>
      )}
      {props.hb && (
        <p className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-3 py-2 font-mono">
          <span className="font-sans font-medium text-gray-500 dark:text-gray-400">Last tick</span>
          <span>{new Date(props.hb.lastRunAt).toLocaleString()}</span>
          {props.hb.jobId && (
            <span className="text-[11px] opacity-90 break-all">
              ({props.hb.jobId.slice(0, 36)}
              {props.hb.jobId.length > 36 ? "…" : ""})
            </span>
          )}
        </p>
      )}
    </CardContent>
  );
}
