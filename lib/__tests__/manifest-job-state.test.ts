import { describe, expect, it } from "vitest";
import type { PythonManifest } from "@/lib/python-queue";
import { MANIFEST_MAX_AUTO_RETRIES } from "@/lib/manifest-upload-constants";
import {
  mergeManifestJsonRecords,
  isTerminalManifestJob,
  shouldWorkerProcessManifest,
  buildUploadFailurePatch,
  buildManualRetryPatch,
  isManifestPathUnderQueueRoot,
} from "@/lib/manifest-job-state";

function baseManifest(over: Partial<PythonManifest> = {}): PythonManifest {
  return {
    title: "T",
    description: "D",
    videoPath: "v.mp4",
    ...over,
  };
}

describe("manifest job state helpers", () => {
  it("mergeManifestJsonRecords overlays patch keys", () => {
    expect(
      mergeManifestJsonRecords(
        { a: 1, b: 2, bot: "x" },
        { b: 3, upload_status: "failed" },
      ),
    ).toEqual({ a: 1, b: 3, bot: "x", upload_status: "failed" });
  });

  it("isTerminalManifestJob when failed and retry_count at cap", () => {
    expect(
      isTerminalManifestJob(
        baseManifest({ upload_status: "failed", retry_count: MANIFEST_MAX_AUTO_RETRIES }),
      ),
    ).toBe(true);
    expect(
      isTerminalManifestJob(
        baseManifest({
          upload_status: "failed",
          retry_count: MANIFEST_MAX_AUTO_RETRIES - 1,
        }),
      ),
    ).toBe(false);
  });

  it("shouldWorkerProcessManifest skips done and terminal failed", () => {
    expect(shouldWorkerProcessManifest(baseManifest({ upload_status: "done" }))).toBe(
      false,
    );
    expect(
      shouldWorkerProcessManifest(
        baseManifest({
          upload_status: "failed",
          retry_count: MANIFEST_MAX_AUTO_RETRIES,
        }),
      ),
    ).toBe(false);
    expect(shouldWorkerProcessManifest(baseManifest())).toBe(true);
    expect(
      shouldWorkerProcessManifest(
        baseManifest({ upload_status: "failed", retry_count: 1 }),
      ),
    ).toBe(true);
  });

  it("buildUploadFailurePatch increments retry and sets fields", () => {
    const p = buildUploadFailurePatch(baseManifest({ retry_count: 1 }), "oops");
    expect(p.upload_status).toBe("failed");
    expect(p.retry_count).toBe(2);
    expect(p.last_error).toBe("oops");
    expect(typeof p.last_attempt_at).toBe("string");
  });

  it("buildManualRetryPatch resets queue fields", () => {
    const p = buildManualRetryPatch();
    expect(p).toMatchObject({
      upload_status: "queued",
      retry_count: 0,
      last_error: "",
    });
  });

  it("isManifestPathUnderQueueRoot accepts manifests/*.json under root", () => {
    const root = "/BotQueue";
    expect(
      isManifestPathUnderQueueRoot("/BotQueue/manifests/job.json", root),
    ).toBe(true);
    expect(isManifestPathUnderQueueRoot("/Other/manifests/job.json", root)).toBe(
      false,
    );
    expect(isManifestPathUnderQueueRoot("/BotQueue/manifests/job.txt", root)).toBe(
      false,
    );
  });
});
