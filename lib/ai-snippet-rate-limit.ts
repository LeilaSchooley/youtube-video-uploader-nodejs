const MIN_MS = 10_000;
const lastBySession = new Map<string, number>();

export function aiSnippetRateLimitOk(sessionId: string): {
  ok: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const prev = lastBySession.get(sessionId) ?? 0;
  const elapsed = now - prev;
  if (elapsed < MIN_MS) {
    return { ok: false, retryAfterMs: MIN_MS - elapsed };
  }
  lastBySession.set(sessionId, now);
  return { ok: true };
}
