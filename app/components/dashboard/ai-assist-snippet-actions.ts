import {
  DESCRIPTION_AFFILIATE_DISCLOSURE_KEY,
  DESCRIPTION_FOOTER_TEMPLATE_KEY,
  applyDescriptionTemplate,
  ensureAffiliateDisclosure,
} from "@/lib/description-templates";

export type SuggestResponse = {
  titles?: string[];
  description?: string;
  chapterOutline?: string;
  ctas?: string[];
  warnings?: string[];
  error?: string;
  retryAfterMs?: number;
};

type Toast = (opts: { type: "success" | "error" | "info"; message: string }) => void;

export async function runSuggestRequest(opts: {
  sourceTitle: string;
  sourceDescription: string;
  keywords: string;
  niche: string;
  language: string;
}) {
  const res = await fetch("/api/ai/suggest-snippet", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceTitle: opts.sourceTitle,
      sourceDescription: opts.sourceDescription.trim() || undefined,
      keywords: opts.keywords.trim() || undefined,
      niche: opts.niche.trim() || undefined,
      language: opts.language.trim() || undefined,
    }),
  });
  const data = (await res.json()) as SuggestResponse;
  return { res, data };
}

export function appendFooterTemplate(opts: {
  readTitle: () => string;
  readDescription: () => string;
  writeDescription: (value: string) => void;
  link: string;
  coupon: string;
  showToast: Toast;
}) {
  let template = "";
  try {
    template = localStorage.getItem(DESCRIPTION_FOOTER_TEMPLATE_KEY) ?? "";
  } catch {
    opts.showToast({ type: "error", message: "Could not read templates" });
    return;
  }

  if (!template.trim()) {
    opts.showToast({
      type: "error",
      message: "Save a footer template in Description footer settings first",
    });
    return;
  }

  const block = applyDescriptionTemplate(template, {
    title: opts.readTitle(),
    link: opts.link.trim(),
    coupon: opts.coupon.trim(),
  });
  const current = opts.readDescription().trimEnd();
  const next = current ? `${current}\n\n${block}` : block;
  opts.writeDescription(next);
  opts.showToast({ type: "success", message: "Footer appended" });
}

export function ensureDisclosureLine(opts: {
  readDescription: () => string;
  writeDescription: (value: string) => void;
  showToast: Toast;
}) {
  let line = "";
  try {
    line = localStorage.getItem(DESCRIPTION_AFFILIATE_DISCLOSURE_KEY)?.trim() ?? "";
  } catch {
    opts.showToast({ type: "error", message: "Could not read disclosure line" });
    return;
  }

  if (!line) {
    opts.showToast({
      type: "error",
      message: "Set affiliate disclosure line in settings first",
    });
    return;
  }

  const { text, appended } = ensureAffiliateDisclosure(opts.readDescription(), line);
  if (!appended) {
    opts.showToast({
      type: "info",
      message: "No change (no affiliate-like keywords, or disclosure already present)",
    });
    return;
  }
  opts.writeDescription(text);
  opts.showToast({ type: "success", message: "Disclosure appended" });
}

export async function copyTitleAndDescription(opts: {
  readTitle: () => string;
  readDescription: () => string;
  showToast: Toast;
}) {
  try {
    await navigator.clipboard.writeText(`${opts.readTitle()}\n\n${opts.readDescription()}`);
    opts.showToast({ type: "success", message: "Copied title + description" });
  } catch {
    opts.showToast({ type: "error", message: "Clipboard not available" });
  }
}
