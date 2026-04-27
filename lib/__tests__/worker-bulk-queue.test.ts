import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bulk-queue", () => ({
  getBulkQueue: vi.fn(() => [
    {
      id: "job-paused",
      status: "pending",
      sessionId: "s-paused",
      items: [{ title: "A" }],
      progress: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: "job-active",
      status: "pending",
      sessionId: "s-active",
      items: [{ title: "B" }],
      progress: [],
      createdAt: new Date().toISOString(),
    },
  ]),
}));

vi.mock("@/lib/worker-pause", () => ({
  isWorkerPausedForSession: vi.fn((sessionId: string) => sessionId === "s-paused"),
}));

import { getNextBulkJobToProcess } from "@/lib/worker-bulk-queue";

describe("getNextBulkJobToProcess", () => {
  it("skips paused-session jobs and returns active session job", () => {
    expect(getNextBulkJobToProcess()).toEqual({
      id: "job-active",
      status: "pending",
    });
  });
});
