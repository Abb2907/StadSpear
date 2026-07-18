import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evaluateMetric } from "./stadspear";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface MessageRow {
  role: string;
  parts: unknown;
  created_at: string;
}
interface ToolRow {
  tool_name: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
}
interface RunRow {
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  stream_duration_ms: number | null;
  status: string | null;
  finish_reason: string | null;
  created_at: string;
}
interface FeedbackRow {
  rating: "up" | "down" | string;
  reason: string | null;
  message_id: string | null;
  created_at: string;
}
interface TelemetryRow {
  metric: string;
  value: JsonValue;
  generated_at: string;
}
interface TextPart {
  type: "text";
  text: string;
}

/**
 * Generate a downloadable session report for a single thread.
 * Aggregates messages, tool events, AI-gateway runs, feedback, and
 * live telemetry (with alert severity) into a plain DTO for the UI.
 * RLS-scoped: caller must own the thread.
 */
export const getSessionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: thread, error: tErr } = await supabase
      .from("threads")
      .select("id, title, role, stadium, match, language, favorite, created_at, updated_at")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!thread) throw new Error("Thread not found");

    const [msgsRes, toolsRes, runsRes, fbRes, telRes] = await Promise.all([
      supabase.from("messages").select("role, parts, created_at").eq("thread_id", thread.id).order("created_at"),
      supabase.from("tool_events").select("tool_name, status, latency_ms, error_message, created_at").eq("thread_id", thread.id).order("created_at"),
      supabase.from("ai_gateway_runs").select("model, prompt_tokens, completion_tokens, total_tokens, stream_duration_ms, status, finish_reason, created_at").eq("thread_id", thread.id).order("created_at"),
      supabase.from("feedback").select("rating, reason, message_id, created_at").eq("thread_id", thread.id).order("created_at"),
      thread.stadium
        ? supabase.from("telemetry_cache").select("metric, value, generated_at").eq("stadium", thread.stadium)
        : Promise.resolve({ data: [] as TelemetryRow[], error: null }),
    ]);

    const messages = (msgsRes.data ?? []) as MessageRow[];
    const tools = (toolsRes.data ?? []) as ToolRow[];
    const runs = (runsRes.data ?? []) as RunRow[];
    const feedback = (fbRes.data ?? []) as FeedbackRow[];
    const telemetry = ((telRes.data ?? []) as TelemetryRow[]);

    const totalTokens = runs.reduce((a, r) => a + (r.total_tokens ?? 0), 0);
    const avgStreamMs = runs.length
      ? Math.round(runs.reduce((a, r) => a + (r.stream_duration_ms ?? 0), 0) / runs.length)
      : 0;

    type Bucket = { ok: number; degraded: number; unavailable: number; error: number };
    const toolCounts: Record<string, Bucket> = {};
    for (const t of tools) {
      const bucket = (toolCounts[t.tool_name] ||= { ok: 0, degraded: 0, unavailable: 0, error: 0 });
      const key = (t.status as keyof Bucket) in bucket ? (t.status as keyof Bucket) : "error";
      bucket[key] += 1;
    }
    const alerts = telemetry
      .map((m) => ({ metric: m.metric, ...evaluateMetric(m.metric, m.value) }))
      .filter((a) => a.severity !== "ok");

    const extractText = (parts: unknown): string => {
      if (!Array.isArray(parts)) return String(parts ?? "");
      return (parts as TextPart[])
        .filter((p) => p && typeof p === "object" && p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .slice(0, 4000);
    };

    return {
      generatedAt: new Date().toISOString(),
      thread,
      counts: {
        messages: messages.length,
        userMessages: messages.filter((m) => m.role === "user").length,
        assistantMessages: messages.filter((m) => m.role === "assistant").length,
        tools: tools.length,
        runs: runs.length,
        feedback: feedback.length,
        thumbsUp: feedback.filter((f) => f.rating === "up").length,
        thumbsDown: feedback.filter((f) => f.rating === "down").length,
      },
      totalTokens,
      avgStreamMs,
      toolBreakdown: toolCounts,
      alerts,
      telemetry,
      messages: messages.map((m) => ({
        role: m.role,
        text: extractText(m.parts),
        created_at: m.created_at,
      })),
      tools,
      runs,
      feedback,
    };
  });
