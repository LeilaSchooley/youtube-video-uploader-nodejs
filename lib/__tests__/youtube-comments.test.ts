import { describe, expect, it } from "vitest";
import {
  getManifestTopComment,
  isManifestCommentAlreadyPosted,
} from "@/lib/youtube-comments";
import type { PythonManifest } from "@/lib/python-queue";

function baseManifest(overrides: Partial<PythonManifest> = {}): PythonManifest {
  return {
    title: "T",
    description: "D",
    videoPath: "videos/a.mp4",
    ...overrides,
  };
}

describe("youtube comment manifest helpers", () => {
  it("prefers top_comment and trims it", () => {
    const manifest = baseManifest({
      top_comment: "   hello world   ",
      pinned_comment: "fallback",
    });
    expect(getManifestTopComment(manifest)).toBe("hello world");
  });

  it("falls back to pinned_comment", () => {
    const manifest = baseManifest({ pinned_comment: "  fallback text  " });
    expect(getManifestTopComment(manifest)).toBe("fallback text");
  });

  it("returns null when comment text is missing", () => {
    const manifest = baseManifest();
    expect(getManifestTopComment(manifest)).toBeNull();
  });

  it("treats posted state as idempotent", () => {
    expect(
      isManifestCommentAlreadyPosted(
        baseManifest({ comment_posted: true, comment_status: "pending" }),
      ),
    ).toBe(true);
    expect(
      isManifestCommentAlreadyPosted(baseManifest({ comment_status: "posted" })),
    ).toBe(true);
    expect(
      isManifestCommentAlreadyPosted(baseManifest({ comment_status: "failed" })),
    ).toBe(false);
  });
});
