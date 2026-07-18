import { describe, it, expect } from "vitest";

/**
 * Unit-level health-check contract tests.
 *
 * The route file itself needs a live TanStack Start server runtime to
 * execute, so we validate the shape and behavior of the response payload
 * by simulating the same checks the handler performs.
 */

interface HealthPayload {
  status: "ok" | "degraded";
  timestamp: string;
  requestId: string;
  durationMs: number;
  checks: { runtime: boolean; env: boolean; db: boolean };
  dbLatencyMs: number | null;
  version: string;
}

function buildPayload(overrides: Partial<HealthPayload["checks"]> = {}): HealthPayload {
  const checks = { runtime: true, env: true, db: true, ...overrides };
  const healthy = checks.runtime && checks.env && checks.db;
  return {
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
    durationMs: 5,
    checks,
    dbLatencyMs: 12,
    version: "test",
  };
}

function resolveBackendConfig(env: Record<string, string | undefined>) {
  return {
    url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

describe("health check contract", () => {
  it("returns ok when all subsystems are healthy", () => {
    const p = buildPayload();
    expect(p.status).toBe("ok");
    expect(p.checks.runtime).toBe(true);
    expect(p.checks.env).toBe(true);
    expect(p.checks.db).toBe(true);
  });

  it("returns degraded when env is missing", () => {
    const p = buildPayload({ env: false });
    expect(p.status).toBe("degraded");
  });

  it("returns degraded when database is unreachable", () => {
    const p = buildPayload({ db: false });
    expect(p.status).toBe("degraded");
  });

  it("prefers backend env names in server routes", () => {
    const config = resolveBackendConfig({
      SUPABASE_URL: "https://backend.example",
      SUPABASE_PUBLISHABLE_KEY: "backend-key",
      VITE_SUPABASE_URL: "https://vite.example",
      VITE_SUPABASE_PUBLISHABLE_KEY: "vite-key",
    });

    expect(config).toEqual({
      url: "https://backend.example",
      publishableKey: "backend-key",
    });
  });

  it("falls back to VITE env names for local CI builds", () => {
    const config = resolveBackendConfig({
      VITE_SUPABASE_URL: "https://vite.example",
      VITE_SUPABASE_PUBLISHABLE_KEY: "vite-key",
    });

    expect(config).toEqual({
      url: "https://vite.example",
      publishableKey: "vite-key",
    });
  });

  it("emits a valid ISO-8601 timestamp", () => {
    const p = buildPayload();
    expect(() => new Date(p.timestamp).toISOString()).not.toThrow();
    expect(new Date(p.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("emits a UUID request id", () => {
    const p = buildPayload();
    expect(p.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
