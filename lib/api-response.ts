/**
 * Standard API error shape for consistent client handling.
 */

export interface ApiErrorBody {
  error: string;
  code?: string;
}

export function apiError(
  message: string,
  status: number,
  code?: string,
): { body: ApiErrorBody; status: number } {
  return {
    body: { error: message, ...(code && { code }) },
    status,
  };
}

/** Return a Response with standard error JSON body */
export function jsonApiError(
  message: string,
  status: number,
  code?: string,
): Response {
  const { body } = apiError(message, status, code);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
