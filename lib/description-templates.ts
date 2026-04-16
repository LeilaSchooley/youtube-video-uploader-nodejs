/**
 * Non-AI description footer / CTA templates with simple variable substitution.
 * Persisted client-side (localStorage) from dashboard settings.
 */

export const DESCRIPTION_FOOTER_TEMPLATE_KEY =
  "marketing.descriptionFooterTemplate";
export const DESCRIPTION_AFFILIATE_DISCLOSURE_KEY =
  "marketing.affiliateDisclosureLine";

export interface TemplateVars {
  title: string;
  link: string;
  coupon: string;
  channelUrl?: string;
}

const VAR_RE = /\{(title|link|coupon|channelUrl)\}/g;

export function applyDescriptionTemplate(
  template: string,
  vars: Partial<TemplateVars>,
): string {
  if (!template.trim()) return "";
  return template.replace(VAR_RE, (_, key: string) => {
    const k = key as keyof TemplateVars;
    const v = vars[k];
    return typeof v === "string" ? v : "";
  });
}

const AFFILIATE_HINTS =
  /\b(affiliate|amazon|amzn\.|amazon\.|commission|sponsored|paid\s+partnership|#ad)\b/i;

/**
 * If description matches affiliate-ish language and requiredLine is non-empty,
 * append requiredLine when not already present (case-insensitive contains).
 */
export function ensureAffiliateDisclosure(
  description: string,
  requiredLine: string,
): { text: string; appended: boolean } {
  const d = description ?? "";
  const line = (requiredLine ?? "").trim();
  if (!line) return { text: d, appended: false };
  if (!AFFILIATE_HINTS.test(d)) return { text: d, appended: false };
  const normalized = line.toLowerCase();
  if (d.toLowerCase().includes(normalized)) {
    return { text: d, appended: false };
  }
  const sep = d.trimEnd().endsWith("\n") ? "" : "\n\n";
  return { text: `${d.trimEnd()}${sep}${line}\n`, appended: true };
}
