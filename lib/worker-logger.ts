/**
 * Simple structured logger for the worker.
 * Set WORKER_LOG_JSON=1 for JSON lines (one object per line) for production log aggregation.
 */

const LOG_JSON = process.env.WORKER_LOG_JSON === "1" || process.env.WORKER_LOG_JSON === "true";
const PREFIX = "[WORKER]";

function formatMessage(
  level: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const timestamp = new Date().toISOString();
  if (LOG_JSON) {
    return JSON.stringify({
      ts: timestamp,
      level,
      message,
      ...meta,
    });
  }
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} ${PREFIX} [${level}] ${message}${metaStr}`;
}

export const workerLog = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(formatMessage("error", message, meta));
  },
};
