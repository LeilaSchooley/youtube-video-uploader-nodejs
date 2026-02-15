/**
 * Retry a YouTube API call on 403/429 (quota or rate limit) with exponential backoff.
 */

const MAX_ATTEMPTS = 3;
const INITIAL_DELAY_MS = 2000;

function getStatusFromError(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const err = error as { response?: { status?: number }; code?: number };
    return err.response?.status ?? err.code;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function; on 403 or 429, retry up to MAX_ATTEMPTS with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, status: number, delayMs: number) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = getStatusFromError(e);
      const isRetryable = status === 403 || status === 429;
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw e;
      }
      const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      onRetry?.(attempt, status ?? 0, delayMs);
      await delay(delayMs);
    }
  }
  throw lastError;
}
