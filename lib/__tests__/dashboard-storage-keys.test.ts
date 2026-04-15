import { describe, expect, it } from "vitest";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

describe("DASHBOARD_STORAGE", () => {
  it("has non-empty string values", () => {
    for (const [key, value] of Object.entries(DASHBOARD_STORAGE)) {
      expect(value, key).toMatch(/\S/);
    }
  });

  it("uses unique localStorage key strings", () => {
    const values = Object.values(DASHBOARD_STORAGE);
    expect(new Set(values).size).toBe(values.length);
  });
});
