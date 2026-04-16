import type { SessionAiAssist, AiAssistProvider } from "@/lib/session";

type SessionLike = { aiAssist?: SessionAiAssist } | undefined;

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";

function hasSessionOrEnvOpenAi(session: SessionLike): boolean {
  return !!(
    session?.aiAssist?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim()
  );
}

function hasSessionOrEnvAnthropic(session: SessionLike): boolean {
  return !!(
    session?.aiAssist?.anthropicApiKey?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim()
  );
}

export function resolveAiProvider(
  session: SessionLike,
): AiAssistProvider {
  const p = session?.aiAssist?.provider;
  if (p === "openai" || p === "anthropic") return p;
  if (hasSessionOrEnvOpenAi(session)) return "openai";
  if (hasSessionOrEnvAnthropic(session)) return "anthropic";
  return "openai";
}

export function resolveModelForProvider(
  session: SessionLike,
  provider: AiAssistProvider,
): string {
  const m = session?.aiAssist?.model?.trim();
  if (m) return m;
  return provider === "openai"
    ? DEFAULT_OPENAI_MODEL
    : DEFAULT_ANTHROPIC_MODEL;
}

/** Session-stored key first, then environment (BYOK / server deploy). */
export function resolveAiApiKey(
  session: SessionLike,
  provider: AiAssistProvider,
): string | null {
  if (provider === "openai") {
    const s = session?.aiAssist?.openaiApiKey?.trim();
    if (s) return s;
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  const s = session?.aiAssist?.anthropicApiKey?.trim();
  if (s) return s;
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export function hasAnyAiKey(session: SessionLike): boolean {
  return (
    !!resolveAiApiKey(session, "openai") ||
    !!resolveAiApiKey(session, "anthropic")
  );
}
