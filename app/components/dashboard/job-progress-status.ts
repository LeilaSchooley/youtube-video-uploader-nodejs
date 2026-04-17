export type ProgressLike = {
  status?: string;
  videoId?: string;
};

const SUCCESS_TOKENS = [
  "Uploaded",
  "Completed",
  "Scheduled",
  "scheduled",
  "Already uploaded",
] as const;

const FAILURE_TOKENS = [
  "Failed",
  "Missing",
  "Invalid",
  "not found",
  "Cannot access",
  "error",
] as const;

const PROCESSING_TOKENS = ["Uploading", "thumbnail", "Checking", "Fetching"] as const;

export function isProgressSuccess(item?: ProgressLike | null): boolean {
  if (!item) return false;
  if (item.videoId) return true;
  if (!item.status) return false;
  return SUCCESS_TOKENS.some((token) => item.status!.includes(token));
}

export function isProgressFailure(item?: ProgressLike | null): boolean {
  if (!item?.status) return false;
  return FAILURE_TOKENS.some((token) => item.status!.includes(token));
}

export function isProgressProcessing(item?: ProgressLike | null): boolean {
  if (!item?.status) return false;
  if (item.status === "Pending") return true;
  return PROCESSING_TOKENS.some((token) => item.status!.includes(token));
}
