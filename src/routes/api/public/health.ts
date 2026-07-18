import { createFileRoute } from "@tanstack/react-router";
import { logger } from "@/lib/logger";

const getBackendConfig = () => ({
  url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  publishableKey:
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

/**
 * Public health-check endpoint.
 *
 * GET /api/public/health
 *   → 200 { status: "ok", uptime, timestamp, checks: { runtime, env, db } }
 *   → 503 { status: "degraded", ... } if any critical check fails
 *
 * The endpoint intentionally lives under /api/public/* so external uptime
 * monitors (Better Uptime, UptimeRobot, GitHub Actions smoke tests) can hit
 * it without authentication. It never returns PII or secret values — only
 * booleans indicating whether required config is present.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        const requestId = crypto.randomUUID();

        // 1. Runtime check — verifies the Worker responded at all.
        const runtimeOk = true;

        // 2. Env check — required backend config for server routes. In
        // production these are exposed as SUPABASE_*; VITE_* remains as a
        // local/CI fallback for preview builds.
        const { url, publishableKey } = getBackendConfig();
        const envOk = Boolean(url && publishableKey);

        // 3. Database check — a shallow HEAD request against the Data API,
        // using the publishable key so RLS still applies and no privileged
        // access leaks. Wrapped in a timeout so a slow DB never wedges the
        // health probe.
        let dbOk = false;
        let dbLatencyMs: number | null = null;
        const dbStarted = Date.now();
        try {
          if (url && publishableKey) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${url}/rest/v1/`, {
              method: "GET",
              headers: { apikey: publishableKey },
              signal: controller.signal,
            });
            clearTimeout(timer);
            dbOk = res.status > 0 && res.status < 500; // reachable, not upstream 5xx
            dbLatencyMs = Date.now() - dbStarted;
          }
        } catch {
          dbOk = false;
          dbLatencyMs = Date.now() - dbStarted;
        }

        const healthy = runtimeOk && envOk && dbOk;
        const status = healthy ? "ok" : "degraded";
        const httpStatus = healthy ? 200 : 503;

        logger.info({
          event: "health_check",
          component: "health",
          requestId,
          status,
          durationMs: Date.now() - startedAt,
          runtimeOk,
          envOk,
          dbOk,
          dbLatencyMs,
        });

        return Response.json(
          {
            status,
            timestamp: new Date().toISOString(),
            requestId,
            durationMs: Date.now() - startedAt,
            checks: {
              runtime: runtimeOk,
              env: envOk,
              db: dbOk,
            },
            dbLatencyMs,
            version: process.env.VITE_APP_VERSION ?? "dev",
          },
          {
            status: httpStatus,
            headers: {
              "Cache-Control": "no-store, max-age=0",
              "Content-Type": "application/json",
            },
          },
        );
      },
    },
  },
});
