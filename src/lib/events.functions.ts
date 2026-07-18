import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EventsInput = z.object({
  stadium: z.string().max(64).optional(),
  tool: z.string().max(64).optional(),
  fromIso: z.string(),
  toIso: z.string(),
  statuses: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export type ThreadEventGroup = {
  threadId: string | null;
  threadTitle: string | null;
  stadium: string | null;
  match: string | null;
  role: string | null;
  events: {
    id: string;
    tool_name: string;
    status: string;
    latency_ms: number | null;
    error_message: string | null;
    created_at: string;
  }[];
};

interface ToolEventRow {
  id: string;
  tool_name: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
  thread_id: string | null;
}

interface ThreadRow {
  id: string;
  title: string | null;
  stadium: string | null;
  match: string | null;
  role: string | null;
}

/**
 * Return tool-execution events grouped by thread within a time window,
 * with latency summary (avg + p95) and fallback rate. RLS-scoped via the
 * authenticated Supabase client on `context`.
 */
export const getThreadEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EventsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let evQ = supabase
      .from("tool_events")
      .select("id, tool_name, status, latency_ms, error_message, created_at, thread_id")
      .gte("created_at", data.fromIso)
      .lt("created_at", data.toIso)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.tool) evQ = evQ.eq("tool_name", data.tool);
    if (data.statuses && data.statuses.length > 0) evQ = evQ.in("status", data.statuses);
    const { data: eventsRaw, error } = await evQ;
    if (error) throw new Error(error.message);
    const events = (eventsRaw ?? []) as ToolEventRow[];

    const threadIds = Array.from(
      new Set(events.map((e) => e.thread_id).filter((v): v is string => Boolean(v))),
    );
    let threads: ThreadRow[] = [];
    if (threadIds.length > 0) {
      let tQ = supabase
        .from("threads")
        .select("id, title, stadium, match, role")
        .in("id", threadIds);
      if (data.stadium) tQ = tQ.eq("stadium", data.stadium);
      const { data: t, error: tErr } = await tQ;
      if (tErr) throw new Error(tErr.message);
      threads = (t ?? []) as ThreadRow[];
    }
    const threadMap = new Map(threads.map((t) => [t.id, t]));

    const groups = new Map<string, ThreadEventGroup>();
    for (const ev of events) {
      const tid = ev.thread_id;
      if (data.stadium && (!tid || !threadMap.has(tid))) continue;
      const key = tid ?? "__none__";
      const t = tid ? threadMap.get(tid) : null;
      const g: ThreadEventGroup = groups.get(key) ?? {
        threadId: tid,
        threadTitle: t?.title ?? null,
        stadium: t?.stadium ?? null,
        match: t?.match ?? null,
        role: t?.role ?? null,
        events: [],
      };
      g.events.push({
        id: ev.id,
        tool_name: ev.tool_name,
        status: ev.status,
        latency_ms: ev.latency_ms,
        error_message: ev.error_message,
        created_at: ev.created_at,
      });
      groups.set(key, g);
    }

    const grouped = Array.from(groups.values()).sort(
      (a, b) => (b.events[0]?.created_at ?? "").localeCompare(a.events[0]?.created_at ?? ""),
    );

    const total = events.length;
    const okCount = events.filter((e) => e.status === "ok").length;
    const latencies = events
      .map((e) => e.latency_ms)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    const avg = latencies.length
      ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length)
      : 0;
    const p95 = latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
      : 0;

    return {
      from: data.fromIso,
      to: data.toIso,
      stadium: data.stadium ?? null,
      tool: data.tool ?? null,
      summary: {
        total,
        ok: okCount,
        fallback: total - okCount,
        fallbackRate: total ? +((total - okCount) / total).toFixed(3) : 0,
        avgLatencyMs: avg,
        p95LatencyMs: p95,
      },
      groups: grouped,
    };
  });
