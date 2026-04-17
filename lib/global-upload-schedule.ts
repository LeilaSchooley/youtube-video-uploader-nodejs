/**
 * Browser localStorage keys for dashboard-wide upload scheduling (videos per day).
 * Used by Upload schedule UI and upload flows (e.g. Dropbox bulk).
 */

export const UPLOAD_SCHEDULE_ENABLED_KEY = "uploadScheduling.enabled";
export const UPLOAD_SCHEDULE_VPD_KEY = "uploadScheduling.videosPerDay";
/** Legacy key — migrated once into the new keys */
export const LEGACY_VIDEOS_PER_DAY_KEY = "videosPerDay";

export interface UploadSchedulePersisted {
  enabled: boolean;
  videosPerDay: string;
}

/** Read schedule from localStorage (client only). */
export function readUploadScheduleFromStorage(): UploadSchedulePersisted {
  if (typeof window === "undefined") {
    return { enabled: false, videosPerDay: "" };
  }

  let videosPerDay = localStorage.getItem(UPLOAD_SCHEDULE_VPD_KEY) ?? "";
  if (!videosPerDay.trim()) {
    const legacy = localStorage.getItem(LEGACY_VIDEOS_PER_DAY_KEY);
    if (legacy?.trim()) {
      videosPerDay = legacy.trim();
    }
  }

  const enabledRaw = localStorage.getItem(UPLOAD_SCHEDULE_ENABLED_KEY);
  const num = parseInt(videosPerDay, 10);
  const hasPositive = !Number.isNaN(num) && num > 0;

  if (enabledRaw === "true") {
    return { enabled: true, videosPerDay };
  }
  if (enabledRaw === "false") {
    return { enabled: false, videosPerDay };
  }
  // Migration: no explicit flag yet — if legacy had a positive number, treat as enabled
  return {
    enabled: hasPositive,
    videosPerDay,
  };
}

/** True if any upload-schedule value was ever stored in this browser profile. */
export function hasUploadScheduleBrowserPersistence(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(UPLOAD_SCHEDULE_ENABLED_KEY) !== null ||
    localStorage.getItem(UPLOAD_SCHEDULE_VPD_KEY) !== null ||
    localStorage.getItem(LEGACY_VIDEOS_PER_DAY_KEY) !== null
  );
}

export function writeUploadScheduleToStorage(
  enabled: boolean,
  videosPerDay: string,
): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(UPLOAD_SCHEDULE_ENABLED_KEY, String(enabled));
  const trimmed = videosPerDay.trim();
  if (trimmed) {
    localStorage.setItem(UPLOAD_SCHEDULE_VPD_KEY, trimmed);
  } else {
    localStorage.removeItem(UPLOAD_SCHEDULE_VPD_KEY);
  }
  try {
    localStorage.removeItem(LEGACY_VIDEOS_PER_DAY_KEY);
  } catch {
    // ignore
  }
}
