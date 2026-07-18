import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stadium: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("telemetry_cache")
      .select("metric, value, generated_at")
      .eq("stadium", data.stadium);
    if (error) throw new Error(error.message);
    return {
      stadium: data.stadium,
      metrics: rows ?? [],
      fetched_at: new Date().toISOString(),
      degraded: (rows ?? []).length === 0,
    };
  });

// Simulate live drift so tiles update in real time via Supabase Realtime.
// In production this would be a real telemetry pipeline; here we jitter cached
// values slightly and persist so all subscribers see the change.
export const tickTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stadium: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("telemetry_cache")
      .select("id, metric, value")
      .eq("stadium", data.stadium);
    if (error) throw new Error(error.message);
    const now = new Date().toISOString();
    const jitter = (n: number, spread: number, min = 0, max = 100) =>
      Math.max(min, Math.min(max, Math.round(n + (Math.random() - 0.5) * spread)));
    const updates = (rows ?? []).map((r: any) => {
      const v = { ...(r.value ?? {}) };
      switch (r.metric) {
        case "gate_wait":
          v.minutes = jitter(Number(v.minutes ?? 10), 6, 1, 45);
          v.trend = v.minutes > (r.value?.minutes ?? v.minutes) ? "up" : "down";
          break;
        case "concourse_density":
          v.percent = jitter(Number(v.percent ?? 50), 8, 5, 99);
          v.level = v.percent >= 85 ? "critical" : v.percent >= 70 ? "high" : v.percent >= 40 ? "moderate" : "low";
          break;
        case "transit_eta":
          v.minutes = jitter(Number(v.minutes ?? 8), 4, 1, 30);
          break;
        case "ada_restrooms":
          v.available = jitter(Number(v.available ?? 6), 2, 0, 20);
          break;
        case "eco_points":
          v.score = jitter(Number(v.score ?? 78), 4, 20, 100);
          break;
      }
      return { id: r.id, value: v, generated_at: now };
    });
    // Sequential small updates so Realtime emits per-row changes.
    for (const u of updates) {
      await supabaseAdmin
        .from("telemetry_cache")
        .update({ value: u.value, generated_at: u.generated_at })
        .eq("id", u.id);
    }
    return { ok: true, count: updates.length, at: now };
  });
