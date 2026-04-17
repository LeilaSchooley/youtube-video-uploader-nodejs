import type { BulkJob, JobStatus } from "./types";

export interface ProgressItem {
  index: number;
  status: string;
  videoId?: string;
  fileSize?: number;
  duration?: number;
  uploadSpeed?: number;
  title?: string;
}

export interface QueueManagementJobDetailPanelProps {
  selectedJobId: string | null;
  queue: BulkJob[];
  jobStatus: JobStatus;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
  isVideoDetailsCollapsed: boolean;
  setIsVideoDetailsCollapsed: (v: boolean) => void;
  isRemainingSheetCollapsed: boolean;
  setIsRemainingSheetCollapsed: (v: boolean) => void;
}
