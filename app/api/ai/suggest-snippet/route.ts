import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import {
  resolveAiApiKey,
  resolveAiProvider,
  resolveModelForProvider,
} from "@/lib/ai-byok";
import { aiSnippetRateLimitOk } from "@/lib/ai-snippet-rate-limit";
import {
  suggestSnippet,
  type SuggestSnippetInput,
} from "@/lib/ai-snippet";

export const dynamic = "force-dynamic";

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

    const rl = aiSnippetRateLimitOk(sessionId);
    if (!rl.ok) {
      return Response.json(
        {
          error: "Rate limited",
          retryAfterMs: rl.retryAfterMs,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as Partial<SuggestSnippetInput>;
    const sourceTitle = (body.sourceTitle ?? "").trim();
    if (!sourceTitle) {
      return Response.json(
        { error: "sourceTitle is required" },
        { status: 400 },
      );
    }

    const provider = resolveAiProvider(session);
    const apiKey = resolveAiApiKey(session, provider);
    if (!apiKey) {
      return Response.json(
        {
          error:
            "No API key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the environment, or save a key in Dashboard → AI assist settings.",
        },
        { status: 400 },
      );
    }

    const model = resolveModelForProvider(session, provider);
    const input: SuggestSnippetInput = {
      sourceTitle,
      sourceDescription: body.sourceDescription?.trim(),
      keywords: body.keywords?.trim(),
      niche: body.niche?.trim(),
      language: body.language?.trim(),
    };

    const result = await suggestSnippet(provider, apiKey, model, input);
    return Response.json({
      ...result,
      provider,
      model,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
