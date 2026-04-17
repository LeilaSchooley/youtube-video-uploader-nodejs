"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppToast } from "@/app/app-toast-context";
import {
  appendFooterTemplate,
  copyTitleAndDescription,
  ensureDisclosureLine,
  runSuggestRequest,
  type SuggestResponse,
} from "./ai-assist-snippet-actions";

export interface AiAssistSnippetPanelProps {
  /** single: apply into linked form refs. standalone: local draft textareas */
  variant: "single" | "standalone";
  titleInputRef?: RefObject<HTMLInputElement | null>;
  descriptionTextAreaRef?: RefObject<HTMLTextAreaElement | null>;
  /** Card heading */
  heading?: string;
}

export default function AiAssistSnippetPanel({
  variant,
  titleInputRef,
  descriptionTextAreaRef,
  heading = "Title & description assistant",
}: AiAssistSnippetPanelProps) {
  const showToast = useAppToast();
  const [keywords, setKeywords] = useState("");
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SuggestResponse | null>(null);
  const [pickedTitle, setPickedTitle] = useState(0);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [footerLink, setFooterLink] = useState("");
  const [footerCoupon, setFooterCoupon] = useState("");

  const readTitle = () => {
    if (variant === "standalone") return draftTitle.trim();
    const el = titleInputRef?.current;
    return (el?.value ?? "").trim();
  };

  const readDescription = () => {
    if (variant === "standalone") return draftDesc;
    const el = descriptionTextAreaRef?.current;
    return el?.value ?? "";
  };

  const writeDescription = (text: string) => {
    if (variant === "standalone") {
      setDraftDesc(text);
      return;
    }
    const el = descriptionTextAreaRef?.current;
    if (el) {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const writeTitle = (text: string) => {
    if (variant === "standalone") {
      setDraftTitle(text);
      return;
    }
    const el = titleInputRef?.current;
    if (el) {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const suggest = async () => {
    const sourceTitle = readTitle();
    if (!sourceTitle) {
      showToast({
        type: "error",
        message: "Enter a working title first",
      });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { res, data } = await runSuggestRequest({
        sourceTitle,
        sourceDescription: readDescription(),
        keywords,
        niche,
        language,
      });
      if (!res.ok) {
        if (res.status === 429 && data.retryAfterMs) {
          showToast({
            type: "error",
            message: `Slow down — try again in ${Math.ceil(data.retryAfterMs / 1000)}s`,
          });
        } else {
          showToast({
            type: "error",
            message: data.error || "Suggest failed",
          });
        }
        return;
      }
      setResult(data);
      setPickedTitle(0);
      if (data.warnings?.length) {
        showToast({
          type: "info",
          message: data.warnings[0] ?? "Review model warnings",
        });
      }
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const applyPickedTitle = () => {
    const titles = result?.titles;
    if (!titles?.length) {
      showToast({ type: "error", message: "Run Suggest first" });
      return;
    }
    const t = titles[Math.min(pickedTitle, titles.length - 1)];
    if (!t) return;
    writeTitle(t);
    showToast({ type: "success", message: "Title applied" });
  };

  const applyDescription = () => {
    const d = result?.description?.trim();
    if (!d) {
      showToast({ type: "error", message: "No description in last result" });
      return;
    }
    writeDescription(d);
    showToast({ type: "success", message: "Description applied" });
  };

  const appendFooter = () => {
    appendFooterTemplate({
      readTitle,
      readDescription,
      writeDescription,
      link: footerLink,
      coupon: footerCoupon,
      showToast,
    });
  };

  const runDisclosure = () => {
    ensureDisclosureLine({ readDescription, writeDescription, showToast });
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-white/90 p-4 dark:border-violet-800 dark:bg-gray-900/60">
      <h4 className="mb-3 text-sm font-bold text-violet-950 dark:text-violet-100">
        {heading}
      </h4>
      {variant === "standalone" ? (
        <div className="mb-3 space-y-2">
          <Label className="text-xs">Working title</Label>
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Draft title for suggestions / CSV prep"
          />
          <Label className="text-xs">Working description</Label>
          <Textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            rows={4}
            placeholder="Optional starting description"
          />
        </div>
      ) : null}

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Keywords / topics</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. mechanical keyboard, ASMR"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Niche</Label>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g. tech reviews"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Output language</Label>
          <Input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void suggest()} disabled={busy}>
          {busy ? "Thinking…" : "Suggest with AI"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={applyPickedTitle}>
          Apply selected title
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={applyDescription}>
          Apply description
        </Button>
      </div>

      {result?.titles?.length ? (
        <div className="mb-3 space-y-1">
          <Label className="text-xs">Pick a title</Label>
          <div className="flex flex-col gap-1">
            {result.titles.map((t, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-2 rounded border border-gray-200 p-2 text-sm dark:border-gray-700"
              >
                <input
                  type="radio"
                  name="ai-title-pick"
                  checked={pickedTitle === i}
                  onChange={() => setPickedTitle(i)}
                />
                <span className="text-pretty">{t}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {result?.description ? (
        <div className="mb-3 space-y-1">
          <Label className="text-xs">Suggested description</Label>
          <Textarea readOnly rows={6} value={result.description} className="text-xs" />
        </div>
      ) : null}

      {result?.ctas?.length ? (
        <div className="mb-3 text-xs text-muted-foreground">
          <span className="font-semibold">CTA ideas: </span>
          {result.ctas.join(" · ")}
        </div>
      ) : null}

      <div className="mb-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <p className="mb-2 text-xs font-semibold text-foreground">
          Footer template (from saved settings)
        </p>
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Link for {link}"
            value={footerLink}
            onChange={(e) => setFooterLink(e.target.value)}
          />
          <Input
            placeholder="Coupon for {coupon}"
            value={footerCoupon}
            onChange={(e) => setFooterCoupon(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={appendFooter}>
            Append footer
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={runDisclosure}>
            Ensure disclosure
          </Button>
          {variant === "standalone" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void copyTitleAndDescription({ readTitle, readDescription, showToast })}>
              Copy title + description
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
