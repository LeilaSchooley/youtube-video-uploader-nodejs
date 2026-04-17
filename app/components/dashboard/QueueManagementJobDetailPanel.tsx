"use client";

import { useAppToast } from "@/app/app-toast-context";
import QueueJobCurrentProcessing from "./QueueJobCurrentProcessing";
import QueueJobDetailHeader from "./QueueJobDetailHeader";
import QueueJobProgressStats from "./QueueJobProgressStats";
import QueueJobRemainingSheet from "./QueueJobRemainingSheet";
import QueueJobVideoDetailsList from "./QueueJobVideoDetailsList";
import {
  getCurrentProcessingItem,
  getProgressStats,
  getRemainingRows,
  getSelectedJob,
} from "./queue-job-detail-helpers";
import type {
  ProgressItem,
  QueueManagementJobDetailPanelProps,
} from "./queue-job-detail-types";

export type { ProgressItem, QueueManagementJobDetailPanelProps };

export default function QueueManagementJobDetailPanel({
  selectedJobId,
  queue,
  jobStatus,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  requestConfirm,
  isVideoDetailsCollapsed,
  setIsVideoDetailsCollapsed,
  isRemainingSheetCollapsed,
  setIsRemainingSheetCollapsed,
}: QueueManagementJobDetailPanelProps) {
  const showAppToast = useAppToast();
  const selectedJob = getSelectedJob(selectedJobId, queue, jobStatus);
  if (!selectedJob || !selectedJobId) return null;

  const progress = (selectedJob.progress || []) as ProgressItem[];
  const totalVideos = selectedJob.totalVideos || progress.length || 0;
  const { completed, failed, processing, pending, progressPercentage } = getProgressStats(
    progress,
    totalVideos,
  );
  const currentItem = processing > 0 ? getCurrentProcessingItem(progress) : null;
  const remainingRows =
    processing + pending > 0
      ? getRemainingRows(totalVideos, progress, selectedJob.items || [])
      : [];

  return (
    <div className="mt-5 p-6 bg-gradient-to-br from-gray-50 dark:from-gray-800 to-blue-50 dark:to-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-lg">
      <QueueJobDetailHeader
        selectedJob={selectedJob}
        setSelectedJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
        requestConfirm={requestConfirm}
        showAppToast={showAppToast}
      />
      <QueueJobProgressStats
        totalVideos={totalVideos}
        completed={completed}
        processing={processing}
        pending={pending}
        failed={failed}
        progressPercentage={progressPercentage}
      />
      <QueueJobCurrentProcessing item={currentItem} />
      <QueueJobRemainingSheet
        rows={remainingRows}
        selectedJobId={selectedJobId}
        isCollapsed={isRemainingSheetCollapsed}
        setIsCollapsed={setIsRemainingSheetCollapsed}
        showAppToast={showAppToast}
      />
      <QueueJobVideoDetailsList
        progress={progress}
        selectedJob={selectedJob}
        completed={completed}
        totalVideos={totalVideos}
        isCollapsed={isVideoDetailsCollapsed}
        setIsCollapsed={setIsVideoDetailsCollapsed}
      />
    </div>
  );
}
