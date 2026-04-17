"use client";

import { useState } from "react";
import WorkerStatus from "./WorkerStatus";
import PythonQueuePanel from "./PythonQueuePanel";
import UnifiedActivityView from "./UnifiedActivityView";
import QueueManagementToolbar from "./QueueManagementToolbar";
import QueueManagementEmptyState from "./QueueManagementEmptyState";
import QueueManagementJobDetailPanel from "./QueueManagementJobDetailPanel";
import type { BulkJob, JobStatus, PythonQueueData } from "./types";

interface QueueManagementProps {
  queue: BulkJob[];
  workerBusy?: boolean;
  workerHeartbeat?: { lastRunAt: string; jobId?: string } | null;
  pythonQueue?: PythonQueueData | null;
  searchQuery: string;
  selectedJobId: string | null;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  handleQueueAction: (
    jobId: string,
    action:
      | "pause"
      | "resume"
      | "cancel"
      | "delete"
      | "delete-all-jobs"
      | "retry-failed",
  ) => Promise<void>;
  jobStatus: JobStatus;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
  onGoToUpload?: () => void;
}

export default function QueueManagement({
  queue,
  workerBusy,
  workerHeartbeat,
  pythonQueue,
  searchQuery,
  selectedJobId,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  handleQueueAction,
  jobStatus,
  requestConfirm,
  onGoToUpload,
}: QueueManagementProps) {
  const [isVideoDetailsCollapsed, setIsVideoDetailsCollapsed] = useState(false);
  const [isRemainingSheetCollapsed, setIsRemainingSheetCollapsed] =
    useState(false);

  return (
    <>
      <PythonQueuePanel
        data={pythonQueue ?? null}
        workerHeartbeat={workerHeartbeat}
      />

      <UnifiedActivityView
        queue={queue}
        searchQuery={searchQuery}
        manifestVisible={!!pythonQueue?.dropboxConfigured}
        selectedBulkJobId={selectedJobId}
        setSelectedBulkJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
      />

      <WorkerStatus
        queue={queue}
        workerBusy={workerBusy}
        workerHeartbeat={workerHeartbeat}
        pythonPendingCount={pythonQueue?.pending?.length ?? 0}
      />

      <QueueManagementToolbar
        hasJobs={queue.length > 0}
        onDeleteAll={async () => {
          const ok = await requestConfirm({
            title: "Delete all jobs",
            message:
              "This will delete ALL jobs (pending, processing, completed, failed, cancelled). This action cannot be undone. Are you sure?",
            confirmLabel: "Delete all",
            variant: "danger",
          });
          if (ok) {
            await handleQueueAction("", "delete-all-jobs");
            setSelectedJobId(null);
          }
        }}
      />

      {queue.length === 0 &&
        !(pythonQueue?.dropboxConfigured) &&
        !(pythonQueue?.pending && pythonQueue.pending.length > 0) && (
          <QueueManagementEmptyState onGoToUpload={onGoToUpload} />
        )}

      <div className="min-h-0 max-w-5xl mx-auto w-full">
        <QueueManagementJobDetailPanel
          selectedJobId={selectedJobId}
          queue={queue}
          jobStatus={jobStatus}
          setSelectedJobId={setSelectedJobId}
          fetchJobStatus={fetchJobStatus}
          fetchQueue={fetchQueue}
          requestConfirm={requestConfirm}
          isVideoDetailsCollapsed={isVideoDetailsCollapsed}
          setIsVideoDetailsCollapsed={setIsVideoDetailsCollapsed}
          isRemainingSheetCollapsed={isRemainingSheetCollapsed}
          setIsRemainingSheetCollapsed={setIsRemainingSheetCollapsed}
        />
      </div>
    </>
  );
}
