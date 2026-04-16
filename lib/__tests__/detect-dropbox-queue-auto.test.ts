import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildAutoDetectCandidateRoots,
  detectDropboxQueueAuto,
} from "@/lib/detect-dropbox-queue-auto";
import { detectDropboxPythonQueueLayout } from "@/lib/detect-dropbox-source";
import { listDropboxItems } from "@/lib/dropbox";
import {
  listManifestJsonPathsSortedDropbox,
  downloadAndParseManifest,
} from "@/lib/python-queue-dropbox";

vi.mock("@/lib/detect-dropbox-source", () => ({
  detectDropboxPythonQueueLayout: vi.fn(),
}));

vi.mock("@/lib/python-queue-dropbox", () => ({
  listManifestJsonPathsSortedDropbox: vi.fn(),
  downloadAndParseManifest: vi.fn(),
}));

vi.mock("@/lib/dropbox", () => ({
  listDropboxItems: vi.fn(),
}));

const detectLayout = vi.mocked(detectDropboxPythonQueueLayout);
const listManifests = vi.mocked(listManifestJsonPathsSortedDropbox);
const downloadParse = vi.mocked(downloadAndParseManifest);
const listItems = vi.mocked(listDropboxItems);

describe("buildAutoDetectCandidateRoots", () => {
  it("puts preferred path first then fixed roots without duplicates", () => {
    const roots = buildAutoDetectCandidateRoots("/youtube_pipeline/queue");
    expect(roots[0]).toBe("/youtube_pipeline/queue");
    expect(roots).toContain("/queue");
    expect(roots.indexOf("/queue")).toBeGreaterThan(0);
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("uses only defaults when preferred is empty", () => {
    const roots = buildAutoDetectCandidateRoots(null);
    expect(roots).toEqual(["/queue", "/youtube_pipeline/queue", "/uploads/queue"]);
  });
});

describe("detectDropboxQueueAuto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listItems.mockResolvedValue([]);
    listManifests.mockResolvedValue(["/queue/manifests/job.json"]);
    downloadParse.mockResolvedValue({
      title: "T",
      description: "D",
      videoPath: "videos/a.mp4",
    });
  });

  it("returns first python_queue with valid manifest sample", async () => {
    detectLayout.mockImplementation(async (path: string) => {
      if (path === "/queue") {
        return {
          mode: "python_queue",
          manifestCount: 3,
          videoCount: 2,
          thumbnailCount: 1,
          resolvedRoot: "/queue",
        };
      }
      return {
        mode: "standard_dropbox_folder",
        manifestCount: 0,
        videoCount: 0,
        thumbnailCount: 0,
        resolvedRoot: path,
      };
    });

    const r = await detectDropboxQueueAuto("token", "sid", "refresh");
    expect(r.found).toBe(true);
    expect(r.path).toBe("/queue");
    expect(r.manifestCount).toBe(3);
    expect(r.validatedSample).toBe(true);
    expect(detectLayout).toHaveBeenCalled();
  });

  it("skips layout when sample manifest does not parse", async () => {
    detectLayout.mockImplementation(async (path: string) => {
      if (path === "/queue") {
        return {
          mode: "python_queue",
          manifestCount: 1,
          videoCount: 0,
          thumbnailCount: 0,
          resolvedRoot: "/queue",
        };
      }
      if (path === "/youtube_pipeline/queue") {
        return {
          mode: "python_queue",
          manifestCount: 1,
          videoCount: 1,
          thumbnailCount: 0,
          resolvedRoot: "/youtube_pipeline/queue",
        };
      }
      return {
        mode: "standard_dropbox_folder",
        manifestCount: 0,
        videoCount: 0,
        thumbnailCount: 0,
        resolvedRoot: path,
      };
    });

    listManifests.mockImplementation(async (root: string) => {
      if (root === "/queue") return ["/queue/manifests/bad.json"];
      if (root === "/youtube_pipeline/queue") {
        return ["/youtube_pipeline/queue/manifests/good.json"];
      }
      return [];
    });

    downloadParse.mockImplementation(async (manifestPath: string) => {
      if (manifestPath.includes("bad.json")) return null;
      return {
        title: "Ok",
        description: "Ok",
        videoPath: "v.mp4",
      };
    });

    const r = await detectDropboxQueueAuto("token", "sid", null);
    expect(r.found).toBe(true);
    expect(r.path).toBe("/youtube_pipeline/queue");
  });

  it("returns invalid_manifest_sample when only bad layouts exist", async () => {
    detectLayout.mockResolvedValue({
      mode: "python_queue",
      manifestCount: 1,
      videoCount: 0,
      thumbnailCount: 0,
      resolvedRoot: "/bad",
    });
    downloadParse.mockResolvedValue(null);

    const r = await detectDropboxQueueAuto("token", "sid", null);
    expect(r.found).toBe(false);
    expect(r.reason).toBe("invalid_manifest_sample");
  });

  it("returns no_dropbox_queue when nothing matches", async () => {
    detectLayout.mockResolvedValue({
      mode: "standard_dropbox_folder",
      manifestCount: 0,
      videoCount: 0,
      thumbnailCount: 0,
      resolvedRoot: "/x",
    });

    const r = await detectDropboxQueueAuto("token", "sid", null);
    expect(r.found).toBe(false);
    expect(r.reason).toBe("no_dropbox_queue");
  });
});
