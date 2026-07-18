/**
 * Lightweight structured logger for production runtime.
 *
 * Emits single-line JSON to stdout/stderr so that the Cloudflare Worker /
 * TanStack Start runtime forwards them to the platform log drain where they
 * can be filtered by `level`, `event`, `component`, or `requestId`.
 *
 * Do NOT log secrets, bearer tokens, cookies, or full request bodies.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  event: string;
  component?: string;
  requestId?: string;
  userId?: string;
  durationMs?: number;
  status?: number | string;
  [key: string]: unknown;
}

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const raw = (typeof process !== "undefined" && process.env?.LOG_LEVEL) || "info";
  return LEVEL_RANK[(raw as Level)] ?? LEVEL_RANK.info;
}

function emit(level: Level, fields: LogFields) {
  if (LEVEL_RANK[level] < minLevel()) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
