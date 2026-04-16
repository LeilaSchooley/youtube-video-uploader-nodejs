"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppToast } from "@/app/app-toast-context";
import {
  DESCRIPTION_FOOTER_TEMPLATE_KEY,
  DESCRIPTION_AFFILIATE_DISCLOSURE_KEY,
  applyDescriptionTemplate,
} from "@/lib/description-templates";

export default function DescriptionTemplateSettings() {
  const showToast = useAppToast();
  const [hydrated, setHydrated] = useState(false);
  const [footer, setFooter] = useState("");
  const [disclosure, setDisclosure] = useState("");
  const [previewTitle, setPreviewTitle] = useState("My video title");
  const [previewLink, setPreviewLink] = useState("https://");
  const [previewCoupon, setPreviewCoupon] = useState("");

  useEffect(() => {
    try {
      setFooter(localStorage.getItem(DESCRIPTION_FOOTER_TEMPLATE_KEY) ?? "");
      setDisclosure(
        localStorage.getItem(DESCRIPTION_AFFILIATE_DISCLOSURE_KEY) ?? "",
      );
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const persist = () => {
    try {
      localStorage.setItem(DESCRIPTION_FOOTER_TEMPLATE_KEY, footer);
      localStorage.setItem(DESCRIPTION_AFFILIATE_DISCLOSURE_KEY, disclosure);
      showToast({ type: "success", message: "Description templates saved" });
    } catch {
      showToast({ type: "error", message: "Could not save to localStorage" });
    }
  };

  const preview = applyDescriptionTemplate(footer, {
    title: previewTitle,
    link: previewLink,
    coupon: previewCoupon,
    channelUrl: "",
  });

  if (!hydrated) {
    return (
      <Card className="mb-6 border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25">
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading description templates…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25">
      <CardHeader className="space-y-1 pb-3">
        <h3 className="text-lg font-bold text-foreground">
          Description footer &amp; disclosure (no AI)
        </h3>
        <p className="text-xs text-muted-foreground">
          Saved in this browser only. Use placeholders:{" "}
          <code className="text-[11px]">{"{title}"}</code>,{" "}
          <code className="text-[11px]">{"{link}"}</code>,{" "}
          <code className="text-[11px]">{"{coupon}"}</code>,{" "}
          <code className="text-[11px]">{"{channelUrl}"}</code>. The disclosure
          line is used by the assistant panel when you click &quot;Ensure
          disclosure&quot; (appends if the text looks affiliate/sponsor-related
          and the line is missing).
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2">
          <Label htmlFor="footer-template">Footer / CTA block</Label>
          <Textarea
            id="footer-template"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={5}
            className="font-mono text-sm"
            placeholder={`Thanks for watching!\n\nLinks: {link}\nCode: {coupon}`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="affiliate-line">Affiliate / sponsor disclosure line</Label>
          <Input
            id="affiliate-line"
            value={disclosure}
            onChange={(e) => setDisclosure(e.target.value)}
            placeholder="#ad Contains affiliate links."
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Preview title</Label>
            <Input
              value={previewTitle}
              onChange={(e) => setPreviewTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preview link</Label>
            <Input
              value={previewLink}
              onChange={(e) => setPreviewLink(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preview coupon</Label>
            <Input
              value={previewCoupon}
              onChange={(e) => setPreviewCoupon(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded-md border bg-background/80 p-3 text-xs whitespace-pre-wrap">
          {preview || "(empty preview)"}
        </div>
        <Button type="button" onClick={persist}>
          Save templates
        </Button>
      </CardContent>
    </Card>
  );
}
