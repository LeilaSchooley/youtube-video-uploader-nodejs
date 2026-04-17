/**
 * Client-safe constants for manifest upload job state (no Node built-ins).
 */

/** Max automatic upload attempts before worker stops retrying (manifest stays in manifests/). */
export const MANIFEST_MAX_AUTO_RETRIES = 3;
