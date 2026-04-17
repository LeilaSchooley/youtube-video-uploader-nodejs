"use client";

import { useAppToast } from "@/app/app-toast-context";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useDropboxAuth } from "./DropboxAuthContext";
import QueueModeStripQueueContent from "./QueueModeStripQueueContent";
import { useQueueModeStripState } from "./useQueueModeStripState";

interface QueueModeStripProps {
  fetchQueue: () => Promise<void>;
  onOpenQueueTab?: () => void;
  /** Opens the Upload tab Dropbox folder picker for manual queue root selection. */
  onRequestManualDropboxQueue?: () => void;
}

export default function QueueModeStrip({
  fetchQueue,
  onOpenQueueTab,
  onRequestManualDropboxQueue,
}: QueueModeStripProps) {
  const showAppToast = useAppToast();
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox } =
    useDropboxAuth();
  const {
    mode,
    hydrated,
    status,
    actionLoading,
    dropboxPythonQueue,
    queueRootPath,
    scanningDropbox,
    notFoundReason,
    layoutCounts,
    persistMode,
    runAutoDetect,
    postAction,
    handleChangeFolder,
  } = useQueueModeStripState({
    fetchQueue,
    showAppToast,
    hasDropboxAuth,
    dropboxAuthLoading,
    onRequestManualDropboxQueue,
  });

  if (!hydrated) {
    return null;
  }

  const paused = status?.paused ?? false;
  const hb = status?.heartbeat;
  const hbRecent =
    !!hb &&
    Date.now() - new Date(hb.lastRunAt).getTime() < 2 * 60 * 1000;
  const py = status?.python;
  const bulk = status?.bulk;

  const notFoundMessage =
    notFoundReason === "invalid_manifest_sample"
      ? "Found a manifests folder, but no valid manifest JSON (need title, description, and video path)."
      : notFoundReason === "dropbox_error"
        ? "Dropbox could not be scanned (network or API error). Try again or pick a folder manually."
        : "No queue found at the usual Dropbox paths.";

  return (
    <Card className="mb-6 overflow-hidden border-border shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 border-b py-3 px-4">
        <span className="text-sm font-semibold text-foreground">
          Upload source
        </span>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/50">
          <Button
            type="button"
            variant={mode === "manual" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => persistMode("manual")}
            className="rounded-md"
          >
            Manual
          </Button>
          <Button
            type="button"
            variant={mode === "queue" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => persistMode("queue")}
            className="rounded-md"
          >
            Queue mode
          </Button>
        </div>
        {mode === "queue" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl">
            Dropbox manifest queue: auto-detect{" "}
            <code className="text-[11px]">manifests/</code>,{" "}
            <code className="text-[11px]">videos/</code>,{" "}
            <code className="text-[11px]">thumbnails/</code>. Start/Stop only
            pauses the worker; keep{" "}
            <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">
              npm run worker
            </code>{" "}
            running for uploads.
          </p>
        )}
      </CardHeader>

      {mode === "queue" && (
        <QueueModeStripQueueContent
          dropboxAuthLoading={dropboxAuthLoading}
          hasDropboxAuth={hasDropboxAuth}
          connectDropbox={connectDropbox}
          scanningDropbox={scanningDropbox}
          dropboxPythonQueue={dropboxPythonQueue}
          queueRootPath={queueRootPath}
          layoutCounts={layoutCounts}
          py={py}
          notFoundReason={notFoundReason}
          notFoundMessage={notFoundMessage}
          paused={paused}
          hbRecent={hbRecent}
          hb={hb}
          bulk={bulk}
          statusCounts={status?.counts || {}}
          actionLoading={actionLoading}
          onRefreshDetect={() => void runAutoDetect(true)}
          onChangeFolder={handleChangeFolder}
          onManualFolderSelect={onRequestManualDropboxQueue}
          onPostAction={postAction}
          onOpenQueueTab={onOpenQueueTab}
        />
      )}
    </Card>
  );
}
