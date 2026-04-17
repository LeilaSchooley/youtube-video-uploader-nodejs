export interface UploadedVideoRecord {
  videoId: string;
  title: string;
  jobId: string;
  uploadedAt: string;
}

export type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
}) => Promise<boolean>;
