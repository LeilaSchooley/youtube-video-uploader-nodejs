import { describe, it, expect } from "vitest";
import {
  resolveDropboxVideoPath,
  resolveDropboxThumbnailPath,
} from "@/lib/python-queue-dropbox";

describe("Dropbox manifest path normalization", () => {
  it("strips redundant queue/ when root is already the queue folder", () => {
    expect(resolveDropboxVideoPath("/queue", "queue/videos/c8fa2c9814b0.mp4")).toBe(
      "/queue/videos/c8fa2c9814b0.mp4",
    );
    expect(
      resolveDropboxThumbnailPath("/queue", "queue/thumbnails/c8fa2c9814b0.jpg"),
    ).toBe("/queue/thumbnails/c8fa2c9814b0.jpg");
  });

  it("keeps videos/… when already relative to queue root", () => {
    expect(resolveDropboxVideoPath("/queue", "videos/a.mp4")).toBe(
      "/queue/videos/a.mp4",
    );
  });
});
