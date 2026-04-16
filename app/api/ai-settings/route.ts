import { cookies } from "next/headers";
import { getSession, setSession } from "@/lib/session";
import type { AiAssistProvider, SessionAiAssist } from "@/lib/session";

export const dynamic = "force-dynamic";

function maskKeyPresent(key: string | undefined): boolean {
  return !!(key && key.trim().length > 0);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const session = getSession(sessionId);
    if (!session?.authenticated) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const a = session.aiAssist;
    return Response.json({
      provider: (a?.provider as AiAssistProvider) || "openai",
      model: a?.model?.trim() || "",
      hasSessionOpenaiKey: maskKeyPresent(a?.openaiApiKey),
      hasSessionAnthropicKey: maskKeyPresent(a?.anthropicApiKey),
      hasEnvOpenai: !!process.env.OPENAI_API_KEY?.trim(),
      hasEnvAnthropic: !!process.env.ANTHROPIC_API_KEY?.trim(),
      dataNotice:
        "Saving an API key stores it in this app’s session file on the server (same class of data as OAuth tokens). Use env vars instead if you prefer not to persist keys in sessions.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const session = getSession(sessionId);
    if (!session?.authenticated) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      provider?: AiAssistProvider;
      model?: string;
      openaiApiKey?: string;
      anthropicApiKey?: string;
      clearOpenaiKey?: boolean;
      clearAnthropicKey?: boolean;
    };

    const prev = session.aiAssist ?? {};
    const next: SessionAiAssist = { ...prev };

    if (body.provider === "openai" || body.provider === "anthropic") {
      next.provider = body.provider;
    }
    if (typeof body.model === "string") {
      next.model = body.model.trim() || undefined;
    }
    if (body.clearOpenaiKey) {
      delete next.openaiApiKey;
    } else if (
      typeof body.openaiApiKey === "string" &&
      body.openaiApiKey.trim()
    ) {
      next.openaiApiKey = body.openaiApiKey.trim();
    }
    if (body.clearAnthropicKey) {
      delete next.anthropicApiKey;
    } else if (
      typeof body.anthropicApiKey === "string" &&
      body.anthropicApiKey.trim()
    ) {
      next.anthropicApiKey = body.anthropicApiKey.trim();
    }

    setSession(sessionId, {
      ...session,
      aiAssist:
        Object.keys(next).length > 0
          ? { ...next, provider: next.provider || prev.provider || "openai" }
          : undefined,
    });

    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
