import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bulk-queue", () => ({
  getBulkQueue: vi.fn(() => []),
}));

vi.mock("@/lib/python-queue", () => ({
  getPythonQueueUiSummary: vi.fn(() => ({
    enabled: false,
    pending: [],
    processedCount: 0,
    failedCount: 0,
  })),
}));

vi.mock("@/lib/worker-health", () => ({
  readHeartbeat: vi.fn(() => null),
}));

vi.mock("@/lib/worker-pause", () => ({
  isWorkerPaused: vi.fn(() => false),
  isWorkerPausedForSession: vi.fn((sessionId: string) => sessionId === "paused-session"),
}));

import { getQueueWorkerStatus } from "@/lib/queue-worker-status";

describe("getQueueWorkerStatus pause scoping", () => {
  it("reports paused=true only for paused session", () => {
    expect(getQueueWorkerStatus("paused-session").paused).toBe(true);
    expect(getQueueWorkerStatus("active-session").paused).toBe(false);
  });
});
