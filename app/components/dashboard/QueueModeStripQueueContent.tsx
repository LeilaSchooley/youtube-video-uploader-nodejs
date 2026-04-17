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
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="mb-2 font-medium">Connect Dropbox to use Queue mode.</p>
          <Button type="button" size="sm" onClick={() => void props.connectDropbox()}>Connect Dropbox</Button>
        </div>
      ) : (
        <>
          {props.scanningDropbox && <p className="text-sm text-muted-foreground" role="status">Scanning Dropbox for queue…</p>}
          {props.dropboxPythonQueue && props.queueRootPath && !props.scanningDropbox ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
              <div className="font-semibold mb-1">Queue detected</div>
              <p className="font-mono text-xs break-all mb-2">{props.queueRootPath}</p>
              {props.layoutCounts && <p className="text-xs mb-1">Folder scan: <strong>{props.layoutCounts.manifestCount}</strong> manifests, <strong>{props.layoutCounts.videoCount}</strong> videos, <strong>{props.layoutCounts.thumbnailCount}</strong> thumbnails</p>}
              {props.py?.enabled ? <p className="text-xs">Ready to upload now: <strong>{props.py.videosReady ?? 0}</strong> with video on disk, <strong>{props.py.pending}</strong> manifest{props.py.pending === 1 ? "" : "s"} pending.</p> : <p className="text-xs opacity-90">Worker summary loads after the worker process polls this session.</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button type="button" variant="secondary" size="sm" disabled={props.scanningDropbox} onClick={props.onRefreshDetect}>Refresh scan</Button>
                <Button type="button" variant="outline" size="sm" disabled={props.scanningDropbox} onClick={() => void props.onChangeFolder()}>Change folder</Button>
              </div>
            </div>
          ) : null}
          {!props.dropboxPythonQueue && !props.scanningDropbox && props.notFoundReason ? (
            <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100" role="alert">
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
      <div className={`rounded-lg border px-3 py-2.5 text-sm ${props.paused ? "border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100" : props.hbRecent ? "border-emerald-300 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100" : "border-gray-200 bg-gray-50/90 text-gray-800 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200"}`} role="status">
        <div className="font-semibold mb-1">Continuous flow (worker)</div>
        {props.paused ? <p><strong>Paused</strong> — the worker will not pick up Python manifests or bulk jobs until you click <strong>Start queue upload</strong>.</p> : props.hbRecent ? <p><strong>Running</strong> — last worker tick {new Date(props.hb!.lastRunAt).toLocaleTimeString()}.</p> : <p><strong>Not paused</strong>, but <strong>no recent heartbeat</strong>. Run <code className="text-[11px] bg-black/5 dark:bg-white/10 px-1 rounded">npm run worker</code>.</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {([["Queued", props.statusCounts.queued ?? "—"], ["Uploading", props.statusCounts.uploading ?? "—"], ["Done", props.statusCounts.done ?? "—"], ["Failed", props.statusCounts.failed ?? "—"]] as const).map(([label, val]) => (
          <div key={label} className="rounded-lg border border-gray-100 dark:border-gray-700 py-3 px-2 bg-gray-50/80 dark:bg-gray-900/40">
            <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{val}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={props.actionLoading || !props.paused} onClick={() => void props.onPostAction("start")} className="bg-emerald-600 text-white hover:bg-emerald-700">Start queue upload</Button>
        <Button type="button" variant="secondary" disabled={props.actionLoading || props.paused} onClick={() => void props.onPostAction("stop")} className="bg-amber-600 text-white hover:bg-amber-700">Stop</Button>
        {props.paused ? <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Paused — no work runs until Start.</span> : <span className="text-xs text-gray-500 dark:text-gray-400">Processing on — worker ticks every ~5s if running.</span>}
        {props.onOpenQueueTab && <Button type="button" variant="link" onClick={props.onOpenQueueTab} className="ml-auto text-violet-600 dark:text-violet-400">Queue &amp; Progress →</Button>}
      </div>
      {props.bulk && (props.bulk.pending > 0 || props.bulk.processing > 0 || props.bulk.completed > 0 || props.bulk.failed > 0) && (
        <p className="text-xs text-gray-600 dark:text-gray-400">Bulk jobs: <strong>{props.bulk.pending}</strong> pending, <strong>{props.bulk.processing}</strong> uploading, <strong>{props.bulk.completed}</strong> completed, <strong>{props.bulk.failed}</strong> failed.</p>
      )}
      {props.hb && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Last worker tick: {new Date(props.hb.lastRunAt).toLocaleString()}
          {props.hb.jobId && <span className="ml-1 font-mono">({props.hb.jobId.slice(0, 28)}{props.hb.jobId.length > 28 ? "…" : ""})</span>}
        </p>
      )}
    </CardContent>
  );
}
