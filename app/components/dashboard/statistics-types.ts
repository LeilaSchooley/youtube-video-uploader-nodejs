export interface UploadedVideoRecord {
  videoId: string;
  title: string;
  jobId: string;
  uploadedAt: string;
  /** Present on newer uploads; use channel filter to separate multi-channel accounts */
  channelId?: string;
  /** Video type (short, montage, review, etc.). */
  videoType?: string;
  /** True if uploaded as a YouTube Short. */
  isShort?: boolean;
  /** Comment posting status for manifest-driven uploads. */
  commentStatus?: "pending" | "posted" | "failed" | "skipped";
  commentPosted?: boolean;
  commentError?: string;
}

export type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
}) => Promise<boolean>;
