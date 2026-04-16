"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppToast } from "@/app/app-toast-context";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/ai-byok";

type Provider = "openai" | "anthropic";

export default function AiAssistSettings() {
  const showToast = useAppToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [hasSessionOpenai, setHasSessionOpenai] = useState(false);
  const [hasSessionAnthropic, setHasSessionAnthropic] = useState(false);
  const [hasEnvOpenai, setHasEnvOpenai] = useState(false);
  const [hasEnvAnthropic, setHasEnvAnthropic] = useState(false);
  const [dataNotice, setDataNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-settings", { credentials: "include" });
      const data = (await res.json()) as {
        error?: string;
        provider?: Provider;
        model?: string;
        hasSessionOpenaiKey?: boolean;
        hasSessionAnthropicKey?: boolean;
        hasEnvOpenai?: boolean;
        hasEnvAnthropic?: boolean;
        dataNotice?: string;
      };
      if (!res.ok) throw new Error(data.error || "Load failed");
      let nextProvider: Provider =
        data.provider === "openai" || data.provider === "anthropic"
          ? data.provider
          : "openai";
      if (
        !data.hasEnvOpenai &&
        !data.hasSessionOpenaiKey &&
        (data.hasEnvAnthropic || data.hasSessionAnthropicKey)
      ) {
        nextProvider = "anthropic";
      }
      setProvider(nextProvider);
      setModel(data.model ?? "");
      setHasSessionOpenai(!!data.hasSessionOpenaiKey);
      setHasSessionAnthropic(!!data.hasSessionAnthropicKey);
      setHasEnvOpenai(!!data.hasEnvOpenai);
      setHasEnvAnthropic(!!data.hasEnvAnthropic);
      setDataNotice(data.dataNotice ?? "");
      setOpenaiKey("");
      setAnthropicKey("");
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Could not load AI settings",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          ...(openaiKey.trim() ? { openaiApiKey: openaiKey.trim() } : {}),
          ...(anthropicKey.trim()
            ? { anthropicApiKey: anthropicKey.trim() }
            : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      showToast({ type: "success", message: "AI assist settings saved" });
      await load();
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const clearKeys = async (which: "openai" | "anthropic" | "both") => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          clearOpenaiKey: which === "openai" || which === "both",
          clearAnthropicKey: which === "anthropic" || which === "both",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Clear failed");
      showToast({ type: "success", message: "Stored API key cleared" });
      await load();
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Clear failed",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="mb-6 border-violet-200 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/25">
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading AI assist settings…
        </CardContent>
      </Card>
    );
  }

  const defaultModelHint =
    provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;

  return (
    <Card className="mb-6 border-violet-200 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/25">
      <CardHeader className="space-y-1 pb-3">
        <h3 className="text-lg font-bold text-foreground">
          AI assist (optional, BYOK)
        </h3>
        <p className="text-xs text-muted-foreground">
          Suggest titles and descriptions before upload. Only{" "}
          <strong>text you type</strong> (title, description, keywords) is sent
          to the provider — never your video file. You must supply an API key
          (session or server env: <code className="text-[11px]">OPENAI_API_KEY</code>,{" "}
          <code className="text-[11px]">ANTHROPIC_API_KEY</code>).
        </p>
        {dataNotice ? (
          <p className="text-xs text-amber-900 dark:text-amber-200/90">
            {dataNotice}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            OpenAI env: {hasEnvOpenai ? "set" : "not set"}
          </span>
          <span>
            Anthropic env: {hasEnvAnthropic ? "set" : "not set"}
          </span>
          <span>Session OpenAI key: {hasSessionOpenai ? "saved" : "none"}</span>
          <span>
            Session Anthropic key: {hasSessionAnthropic ? "saved" : "none"}
          </span>
        </div>

        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={provider}
            onValueChange={(v) => setProvider(v as Provider)}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">Model (optional)</Label>
          <Input
            id="ai-model"
            placeholder={defaultModelHint}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use {defaultModelHint}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-key">OpenAI API key (optional)</Label>
          <Input
            id="openai-key"
            type="password"
            autoComplete="off"
            placeholder={hasSessionOpenai ? "•••••••• (enter to replace)" : ""}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            className="max-w-md"
          />
          {hasSessionOpenai ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void clearKeys("openai")}
              disabled={saving}
            >
              Clear stored OpenAI key
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="anthropic-key">Anthropic API key (optional)</Label>
          <Input
            id="anthropic-key"
            type="password"
            autoComplete="off"
            placeholder={
              hasSessionAnthropic ? "•••••••• (enter to replace)" : ""
            }
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            className="max-w-md"
          />
          {hasSessionAnthropic ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void clearKeys("anthropic")}
              disabled={saving}
            >
              Clear stored Anthropic key
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save keys & provider"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
