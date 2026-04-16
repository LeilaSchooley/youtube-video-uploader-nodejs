import { describe, expect, it } from "vitest";
import {
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
});
