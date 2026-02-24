/**
 * YouTube metadata utilities: validation, sanitization, duplicate checking.
 * Duplicate checking is now done via the local uploaded-videos list (lib/uploaded-videos.ts).
 * No YouTube API calls are used for duplicate detection; this avoids quota use and is faster.
 */

/** YouTube API limits: https://developers.google.com/youtube/v3/docs/videos#snippet */
export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_DESCRIPTION_MAX = 5000;

/**
 * Sanitize title for YouTube: trim, ensure non-empty, truncate to 100 chars.
 * Returns a valid title (never empty).
 */
export function sanitizeYoutubeTitle(s: string | undefined | null): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled";
  if (t.length <= YOUTUBE_TITLE_MAX) return t;
  return t.slice(0, YOUTUBE_TITLE_MAX - 1) + "…";
}

/**
 * Sanitize description for YouTube: trim, truncate to 5000 chars.
 */
export function sanitizeYoutubeDescription(s: string | undefined | null): string {
  const t = (s ?? "").trim();
  if (t.length <= YOUTUBE_DESCRIPTION_MAX) return t || " ";
  return t.slice(0, YOUTUBE_DESCRIPTION_MAX - 1) + "…";
}

/**
 * Check if title is valid (non-empty, within limit). Returns true if invalid.
 */
export function isTitleInvalid(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  return !t || t.length > YOUTUBE_TITLE_MAX;
}

/**
 * Check if description exceeds limit.
 */
export function isDescriptionInvalid(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  return t.length > YOUTUBE_DESCRIPTION_MAX;
}
