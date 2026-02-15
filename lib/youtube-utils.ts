/**
 * Duplicate checking is now done via the local uploaded-videos list (lib/uploaded-videos.ts).
 * No YouTube API calls are used for duplicate detection; this avoids quota use and is faster.
 */
