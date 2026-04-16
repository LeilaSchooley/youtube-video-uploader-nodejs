/**
 * Bounded Dropbox path discovery for Python manifest queues (Queue Mode).
 */

import { detectDropboxPythonQueueLayout } from "@/lib/detect-dropbox-source";
import { listDropboxItems } from "@/lib/dropbox";
import {
  listManifestJsonPathsSortedDropbox,
  downloadAndParseManifest,
} from "@/lib/python-queue-dropbox";
import { normalizeDropboxPath } from "@/lib/queue-source";

export type DetectDropboxQueueAutoReason =
  | "no_dropbox_queue"
  | "invalid_manifest_sample"
  | "dropbox_error";

export interface DetectDropboxQueueAutoResult {
  found: boolean;
  path?: string;
  manifestCount?: number;
  videoCount?: number;
  thumbnailCount?: number;
  validatedSample?: boolean;
  reason?: DetectDropboxQueueAutoReason;
}

function pushUnique(ordered: string[], p: string) {
  const n = normalizeDropboxPath(p);
  if (!ordered.includes(n)) ordered.push(n);
}

/**
 * Ordered roots to probe with {@link detectDropboxPythonQueueLayout} (each also tries `/queue` under that root).
 */
export function buildAutoDetectCandidateRoots(
  preferredPath?: string | null,
): string[] {
  const ordered: string[] = [];
  if (preferredPath?.trim()) {
    pushUnique(ordered, preferredPath.trim());
  }
  for (const fixed of ["/queue", "/youtube_pipeline/queue", "/uploads/queue"]) {
    pushUnique(ordered, fixed);
  }
  return ordered;
}

async function appendYoutubePipelineChildren(
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
  ordered: string[],
): Promise<void> {
  const base = "/youtube_pipeline";
  try {
    const items = await listDropboxItems(
      base,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    for (const it of items) {
      if (it.type !== "folder") continue;
      const child = `${base}/${it.name}`.replace(/\/+/g, "/");
      pushUnique(ordered, child);
    }
  } catch {
    /* folder missing or API error — skip shallow tier */
  }
}

async function validateSampleManifest(
  resolvedRoot: string,
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
): Promise<boolean> {
  const paths = await listManifestJsonPathsSortedDropbox(
    resolvedRoot,
    accessToken,
    sessionId,
    refresh ?? null,
  );
  for (const manifestPath of paths) {
    const parsed = await downloadAndParseManifest(
      manifestPath,
      accessToken,
      sessionId,
      refresh ?? null,
    );
    if (parsed) return true;
  }
  return false;
}

/**
 * Scan a small fixed set of Dropbox paths (plus shallow `/youtube_pipeline/*`) for a python_queue layout,
 * then require at least one parsable manifest JSON.
 */
export async function detectDropboxQueueAuto(
  accessToken: string,
  sessionId: string | undefined,
  refresh: string | null | undefined,
  options?: { preferredPath?: string | null },
): Promise<DetectDropboxQueueAutoResult> {
  const ordered = buildAutoDetectCandidateRoots(options?.preferredPath ?? null);
  await appendYoutubePipelineChildren(
    accessToken,
    sessionId,
    refresh,
    ordered,
  );

  let sawPythonQueueLayout = false;
  let hadDropboxError = false;

  for (const candidate of ordered) {
    try {
      const probe = await detectDropboxPythonQueueLayout(
        candidate,
        accessToken,
        sessionId,
        refresh,
      );
      if (probe.mode !== "python_queue") continue;

      sawPythonQueueLayout = true;

      const ok = await validateSampleManifest(
        probe.resolvedRoot,
        accessToken,
        sessionId,
        refresh,
      );
      if (!ok) continue;

      return {
        found: true,
        path: probe.resolvedRoot,
        manifestCount: probe.manifestCount,
        videoCount: probe.videoCount,
        thumbnailCount: probe.thumbnailCount,
        validatedSample: true,
      };
    } catch {
      hadDropboxError = true;
    }
  }

  if (sawPythonQueueLayout) {
    return {
      found: false,
      reason: "invalid_manifest_sample",
    };
  }

  if (hadDropboxError) {
    return {
      found: false,
      reason: "dropbox_error",
    };
  }

  return {
    found: false,
    reason: "no_dropbox_queue",
  };
}
