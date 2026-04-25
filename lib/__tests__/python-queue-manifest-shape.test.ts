import { describe, expect, it } from "vitest";
import {
  normalizeManifest,
  normalizeManifestJsonShape,
  parseManifestJson,
} from "@/lib/python-queue";

describe("normalizeManifestJsonShape / parseManifestJson", () => {
  it("maps local_video_path to videoPath when videoPath is missing", () => {
    const raw = {
      title: "A",
      description: "B",
      local_video_path: "clips/x.mp4",
    };
    const parsed = parseManifestJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.videoPath).toBe("clips/x.mp4");
  });

  it("keeps videoPath when both are present", () => {
    const raw = {
      title: "A",
      description: "B",
      videoPath: "a.mp4",
      local_video_path: "ignored.mp4",
    };
    const parsed = parseManifestJson(raw);
    expect(parsed!.videoPath).toBe("a.mp4");
  });

  it("normalizeManifestJsonShape returns same object reference when no change", () => {
    const o = { title: "t", description: "d", videoPath: "v.mp4" };
    expect(normalizeManifestJsonShape(o)).toBe(o);
  });

  it("normalizes Shorts metadata safely for older and newer manifests", () => {
    const normalized = normalizeManifest({
      title: "x".repeat(120),
      description: "Main description",
      videoPath: "v.mp4",
      video_type: "short",
      source_upload_id: " review-123 ",
    });

    expect(normalized.videoType).toBe("short");
    expect(normalized.isShort).toBe(true);
    expect(normalized.shortDowngraded).toBe(false);
    expect(normalized.sourceUploadId).toBe("review-123");
    expect(normalized.title).toHaveLength(100);
    expect(normalized.description).toBe(
      "🔗 Full review + best deals below\n\nMain description",
    );
  });

  it("defaults legacy manifests to review and non-short", () => {
    const normalized = normalizeManifest({
      title: "Review title",
      description: "Review description",
      videoPath: "v.mp4",
    });

    expect(normalized.videoType).toBe("review");
    expect(normalized.isShort).toBe(false);
    expect(normalized.shortDowngraded).toBe(false);
    expect(normalized.title).toBe("Review title");
    expect(normalized.description).toBe("Review description");
  });

  it("treats explicit is_short as authoritative", () => {
    const normalized = normalizeManifest({
      title: "Clip",
      description: "Desc",
      videoPath: "v.mp4",
      video_type: "review",
      is_short: true,
    });

    expect(normalized.videoType).toBe("review");
    expect(normalized.isShort).toBe(true);
    expect(normalized.shortDowngraded).toBe(false);
  });

  it("downgrades Short to regular video when duration exceeds 60 s", () => {
    const normalized = normalizeManifest(
      {
        title: "Too long short",
        description: "Desc",
        videoPath: "v.mp4",
        is_short: true,
      },
      61,
    );

    expect(normalized.isShort).toBe(false);
    expect(normalized.shortDowngraded).toBe(true);
    // Title and description should NOT have Shorts treatment applied
    expect(normalized.title).toBe("Too long short");
    expect(normalized.description).toBe("Desc");
  });

  it("keeps Short metadata when duration is exactly 60 s", () => {
    const normalized = normalizeManifest(
      {
        title: "Edge case short",
        description: "Desc",
        videoPath: "v.mp4",
        is_short: true,
      },
      60,
    );

    expect(normalized.isShort).toBe(true);
    expect(normalized.shortDowngraded).toBe(false);
  });
});
