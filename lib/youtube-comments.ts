import type { google } from "googleapis";
import type { PythonManifest } from "@/lib/python-queue";
import { withRetry } from "@/lib/youtube-retry";

const MAX_COMMENT_LENGTH = 10_000;

export function getManifestTopComment(manifest: PythonManifest): string | null {
  const raw =
    typeof manifest.top_comment === "string" && manifest.top_comment.trim()
      ? manifest.top_comment
      : typeof manifest.pinned_comment === "string" && manifest.pinned_comment.trim()
        ? manifest.pinned_comment
        : "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_COMMENT_LENGTH);
}

export function isManifestCommentAlreadyPosted(
  manifest: PythonManifest,
): boolean {
  return manifest.comment_posted === true || manifest.comment_status === "posted";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const e = error as {
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    const apiMessage = e.response?.data?.error?.message;
    if (typeof apiMessage === "string" && apiMessage.trim()) {
      return apiMessage;
    }
    if (typeof e.message === "string" && e.message.trim()) {
      return e.message;
    }
  }
  return String(error || "comment_post_failed");
}

export async function postTopLevelComment(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  text: string,
): Promise<{ commentId?: string }> {
  const response = await withRetry(() =>
    youtube.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: text,
            },
          },
        },
      },
    }),
  );
  return {
    commentId: response?.data?.id || undefined,
  };
}

export function formatCommentPostError(error: unknown): string {
  return getErrorMessage(error).slice(0, 4000);
}
