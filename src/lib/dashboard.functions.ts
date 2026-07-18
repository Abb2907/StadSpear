import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DashboardInput = z.object({
  stadium: z.string().max(64).optional(),
  sinceMinutes: z.number().int().min(5).max(24 * 60).default(60),
  bucketMinutes: z.number().int().min(1).max(60).default(5),
});

export type ToolBucket = {
  bucket: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  fallbackRate: number;
};
export type ToolFallbackRow = {
  tool: string;
  total: number;
  ok: number;
  degraded: number;
  unavailable: number;
  error: number;
  fallbackRate: number;
  avgLatencyMs: number;
};
export type StreamBucket = {
  bucket: string;
  count: number;
  avgMs: number;
  p95Ms: number;
};

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function bucketLabel(iso: string, bucketMinutes: number) {
  const d = new Date(iso);
  const bucketMs = bucketMinutes * 60_000;
  const b = new Date(Math.floor(d.getTime() / bucketMs) * bucketMs);
  return b.toISOString();
}

export const getStadiumDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DashboardInput.parse(input))
  .handler(async ({ data, context }) => {
    const sinceIso = new Date(Date.now() - data.sinceMinutes * 60_000).toISOString();
    const { supabase } = context;

    // Threads scoped to this stadium (if provided) via RLS + eq filter.
    let threadsQ = supabase
      .from("threads")
      .select("id, stadium, title")
      .gte("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
    if (data.stadium) threadsQ = threadsQ.eq("stadium", data.stadium);
    const [threadsRes, toolsRes, runsRes] = await Promise.all([
      threadsQ,
      supabase
        .from("tool_events")
        .select("tool_name, status, latency_ms, error_message, created_at, thread_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(2000),
      supabase
        .from("ai_gateway_runs")
        .select("stream_duration_ms, total_tokens, status, created_at, thread_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(1000),
    ]);
    if (threadsRes.error) throw new Error(threadsRes.error.message);
    if (toolsRes.error) throw new Error(toolsRes.error.message);
    if (runsRes.error) throw new Error(runsRes.error.message);

    const allowedThreadIds = new Set(
      (threadsRes.data ?? []).map((t: { id: string }) => t.id),
    );
    // Only filter by stadium when the caller asked; otherwise include null-thread events too.
    const filterByStadium = !!data.stadium;

    type ToolEventRow = {
      tool_name: string;
      status: string;
      latency_ms: number | null;
      error_message: string | null;
      created_at: string;
      thread_id: string | null;
    };
    type RunRow = {
      stream_duration_ms: number | null;
      total_tokens: number | null;
      status: string;
      created_at: string;
      thread_id: string | null;
    };

    const tools: ToolEventRow[] = (toolsRes.data ?? []).filter((t: ToolEventRow) =>
      filterByStadium ? t.thread_id && allowedThreadIds.has(t.thread_id) : true,
    );
    const runs: RunRow[] = (runsRes.data ?? []).filter((r: RunRow) =>
      filterByStadium ? r.thread_id && allowedThreadIds.has(r.thread_id) : true,
    );

    // Bucket tool latency + fallback rate.
    const toolBuckets = new Map<string, { latencies: number[]; fallbacks: number }>();
    for (const ev of tools) {
      const key = bucketLabel(ev.created_at, data.bucketMinutes);
      const b = toolBuckets.get(key) ?? { latencies: [], fallbacks: 0 };
      if (typeof ev.latency_ms === "number") b.latencies.push(ev.latency_ms);
      if (ev.status !== "ok") b.fallbacks += 1;
      toolBuckets.set(key, b);
    }
    const toolLatency: ToolBucket[] = Array.from(toolBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => {
        const sorted = [...v.latencies].sort((a, b) => a - b);
        const count = sorted.length;
        return {
          bucket,
          count,
          avgMs: count ? Math.round(sorted.reduce((s, x) => s + x, 0) / count) : 0,
          p95Ms: Math.round(percentile(sorted, 0.95)),
          fallbackRate: count ? +(v.fallbacks / Math.max(count, 1)).toFixed(3) : 0,
        };
      });

    // Per-tool fallback breakdown.
    const perTool = new Map<string, { total: number; ok: number; degraded: number; unavailable: number; error: number; latencies: number[] }>();
    for (const ev of tools) {
      const row = perTool.get(ev.tool_name) ?? { total: 0, ok: 0, degraded: 0, unavailable: 0, error: 0, latencies: [] };
      row.total += 1;
      const s = ev.status as "ok" | "degraded" | "unavailable" | "error";
      if (s === "ok") row.ok += 1;
      else if (s === "degraded") row.degraded += 1;
      else if (s === "unavailable") row.unavailable += 1;
      else row.error += 1;
      if (typeof ev.latency_ms === "number") row.latencies.push(ev.latency_ms);
      perTool.set(ev.tool_name, row);
    }
    const fallbackByTool: ToolFallbackRow[] = Array.from(perTool.entries())
      .map(([tool, v]) => {
        const avg = v.latencies.length ? Math.round(v.latencies.reduce((s, x) => s + x, 0) / v.latencies.length) : 0;
        const fallback = v.degraded + v.unavailable + v.error;
        return {
          tool,
          total: v.total,
          ok: v.ok,
          degraded: v.degraded,
          unavailable: v.unavailable,
          error: v.error,
          fallbackRate: v.total ? +(fallback / v.total).toFixed(3) : 0,
          avgLatencyMs: avg,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Stream duration buckets.
    const streamBuckets = new Map<string, number[]>();
    for (const r of runs) {
      const key = bucketLabel(r.created_at, data.bucketMinutes);
      const arr = streamBuckets.get(key) ?? [];
      if (typeof r.stream_duration_ms === "number") arr.push(r.stream_duration_ms);
      streamBuckets.set(key, arr);
    }
    const streamDuration: StreamBucket[] = Array.from(streamBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, arr]) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return {
          bucket,
          count: sorted.length,
          avgMs: sorted.length ? Math.round(sorted.reduce((s, x) => s + x, 0) / sorted.length) : 0,
          p95Ms: Math.round(percentile(sorted, 0.95)),
        };
      });

    const totalCalls = tools.length;
    const totalFallback = tools.filter((t: any) => t.status !== "ok").length;
    const allLatencies = tools.map((t: any) => t.latency_ms).filter((n: any) => typeof n === "number").sort((a: number, b: number) => a - b);
    const allStreams = runs.map((r: any) => r.stream_duration_ms).filter((n: any) => typeof n === "number").sort((a: number, b: number) => a - b);
    const summary = {
      totalCalls,
      totalFallback,
      fallbackRate: totalCalls ? +(totalFallback / totalCalls).toFixed(3) : 0,
      avgLatencyMs: allLatencies.length ? Math.round(allLatencies.reduce((s: number, x: number) => s + x, 0) / allLatencies.length) : 0,
      p95LatencyMs: Math.round(percentile(allLatencies, 0.95)),
      avgStreamMs: allStreams.length ? Math.round(allStreams.reduce((s: number, x: number) => s + x, 0) / allStreams.length) : 0,
      p95StreamMs: Math.round(percentile(allStreams, 0.95)),
      streamCount: runs.length,
    };

    return {
      stadium: data.stadium ?? null,
      since: sinceIso,
      bucketMinutes: data.bucketMinutes,
      toolLatency,
      fallbackByTool,
      streamDuration,
      summary,
    };
  });
