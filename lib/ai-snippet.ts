import type { AiAssistProvider } from "@/lib/session";

export interface SuggestSnippetInput {
  sourceTitle: string;
  sourceDescription?: string;
  keywords?: string;
  niche?: string;
  language?: string;
}

export interface SuggestSnippetResult {
  titles: string[];
  description: string;
  chapterOutline?: string;
  ctas?: string[];
  warnings: string[];
}

const SYSTEM = `You are a YouTube metadata assistant. Output ONLY valid JSON with this exact shape (no markdown):
{"titles":["string"],"description":"string","chapterOutline":"string or empty","ctas":["string"],"warnings":["string"]}
Rules:
- titles: 3 to 5 distinct options, each under 100 characters, no clickbait lies, no ALL CAPS spam.
- description: under 4500 characters, engaging first lines, optional bullet list, include a generic "Chapters:" section only if chapterOutline is non-empty (you may leave chapterOutline empty).
- chapterOutline: optional newline-separated "0:00 Intro" style lines if user gave enough structure; else "".
- ctas: 2-4 short pinned-comment or end-card style lines (not legal advice).
- warnings: disclaimers e.g. if medical/finance or sponsor language might be needed (user must verify).`;

function userMessage(input: SuggestSnippetInput): string {
  const lang = input.language?.trim() || "English";
  return [
    `Language for output: ${lang}`,
    input.niche?.trim() ? `Niche: ${input.niche.trim()}` : "",
    input.keywords?.trim() ? `Keywords/topics: ${input.keywords.trim()}` : "",
    `Working title: ${input.sourceTitle.trim()}`,
    input.sourceDescription?.trim()
      ? `Working description:\n${input.sourceDescription.trim()}`
      : "No description yet — write one.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function unwrapJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1].trim() : t;
}

function parseJsonResult(raw: string): SuggestSnippetResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJsonFence(raw));
  } catch {
    return {
      titles: [],
      description: "",
      warnings: ["Model returned invalid JSON."],
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { titles: [], description: "", warnings: ["Empty model response."] };
  }
  const o = parsed as Record<string, unknown>;
  const titlesRaw = o.titles;
  const titles = Array.isArray(titlesRaw)
    ? titlesRaw
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const chapterOutline =
    typeof o.chapterOutline === "string" ? o.chapterOutline.trim() : undefined;
  const ctasRaw = o.ctas;
  const ctas = Array.isArray(ctasRaw)
    ? ctasRaw
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6)
    : undefined;
  const w = o.warnings;
  if (Array.isArray(w)) {
    for (const x of w) {
      if (typeof x === "string" && x.trim()) warnings.push(x.trim());
    }
  }
  if (titles.length === 0 && !description) {
    warnings.push("No titles or description parsed; try again.");
  }
  return { titles, description, chapterOutline, ctas, warnings };
}

async function openAiSuggest(
  apiKey: string,
  model: string,
  input: SuggestSnippetInput,
): Promise<SuggestSnippetResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage(input) },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      titles: [],
      description: "",
      warnings: [`OpenAI error (${res.status}): ${text.slice(0, 500)}`],
    };
  }
  let content = "";
  try {
    const j = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = j.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return {
      titles: [],
      description: "",
      warnings: ["Could not parse OpenAI response."],
    };
  }
  return parseJsonResult(content);
}

async function anthropicSuggest(
  apiKey: string,
  model: string,
  input: SuggestSnippetInput,
): Promise<SuggestSnippetResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage(input) }],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      titles: [],
      description: "",
      warnings: [`Anthropic error (${res.status}): ${text.slice(0, 500)}`],
    };
  }
  let content = "";
  try {
    const j = JSON.parse(text) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const block = j.content?.find((c) => c.type === "text");
    content = block?.text?.trim() ?? "";
  } catch {
    return {
      titles: [],
      description: "",
      warnings: ["Could not parse Anthropic response."],
    };
  }
  return parseJsonResult(content);
}

export async function suggestSnippet(
  provider: AiAssistProvider,
  apiKey: string,
  model: string,
  input: SuggestSnippetInput,
): Promise<SuggestSnippetResult> {
  if (provider === "openai") {
    return openAiSuggest(apiKey, model, input);
  }
  return anthropicSuggest(apiKey, model, input);
}
