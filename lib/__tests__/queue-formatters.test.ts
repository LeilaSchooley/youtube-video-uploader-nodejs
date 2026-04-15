import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatFileSize,
  formatSpeed,
} from "@/lib/queue-formatters";

describe("formatFileSize", () => {
  it("returns N/A for missing bytes", () => {
    expect(formatFileSize(undefined)).toBe("N/A");
  });

  it("formats bytes and KB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.00 KB");
  });
});

describe("formatSpeed", () => {
  it("returns empty for missing", () => {
    expect(formatSpeed(undefined)).toBe("");
  });

  it("formats B/s and KB/s", () => {
    expect(formatSpeed(100)).toBe("100 B/s");
    expect(formatSpeed(2048)).toBe("2.00 KB/s");
  });
});

describe("formatDuration", () => {
  it("returns empty for missing", () => {
    expect(formatDuration(undefined)).toBe("");
  });

  it("formats mm:ss and h:mm:ss", () => {
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3665)).toBe("1:01:05");
  });
});
