export interface UploadedVideoRecord {
  videoId: string;
  title: string;
  jobId: string;
  uploadedAt: string;
  /** Present on newer uploads; use channel filter to separate multi-channel accounts */
  channelId?: string;
}

export type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
}) => Promise<boolean>;
