import { describe, it, expect } from "vitest";
import {
  applyDescriptionTemplate,
  ensureAffiliateDisclosure,
} from "@/lib/description-templates";

describe("applyDescriptionTemplate", () => {
  it("substitutes known variables", () => {
    expect(
      applyDescriptionTemplate("Hi {title} — {link} ({coupon})", {
        title: "T",
        link: "https://x",
        coupon: "SAVE",
      }),
    ).toBe("Hi T — https://x (SAVE)");
  });

  it("leaves unknown placeholders empty", () => {
    expect(applyDescriptionTemplate("{channelUrl}", {})).toBe("");
  });
});

describe("ensureAffiliateDisclosure", () => {
  it("appends line when affiliate hint present", () => {
    const { text, appended } = ensureAffiliateDisclosure(
      "Check this amazon link",
      "#ad Affiliate links below.",
    );
    expect(appended).toBe(true);
    expect(text).toContain("#ad Affiliate links below.");
  });

  it("does nothing when no affiliate hint", () => {
    const { text, appended } = ensureAffiliateDisclosure(
      "Just a vlog",
      "#ad Disclosure",
    );
    expect(appended).toBe(false);
    expect(text).toBe("Just a vlog");
  });

  it("does not duplicate disclosure", () => {
    const d = "amazon\n\n#ad Affiliate links below.";
    const { text, appended } = ensureAffiliateDisclosure(
      d,
      "#ad Affiliate links below.",
    );
    expect(appended).toBe(false);
    expect(text).toBe(d);
  });
});
