import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evaluateMetric } from "./stadspear";

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
        : Promise.resolve({ data: [] as any[], error: null } as any),
    ]);

    const messages = msgsRes.data ?? [];
    const tools = toolsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const feedback = fbRes.data ?? [];
    const telemetry = (telRes as any).data ?? [];

    const totalTokens = runs.reduce((a, r: any) => a + (r.total_tokens ?? 0), 0);
    const avgStreamMs = runs.length
      ? Math.round(runs.reduce((a, r: any) => a + (r.stream_duration_ms ?? 0), 0) / runs.length)
      : 0;
    const toolCounts: Record<string, { ok: number; degraded: number; unavailable: number; error: number }> = {};
    for (const t of tools as any[]) {
      const bucket = (toolCounts[t.tool_name] ||= { ok: 0, degraded: 0, unavailable: 0, error: 0 });
      const key = (t.status as keyof typeof bucket) in bucket ? (t.status as keyof typeof bucket) : "error";
      bucket[key] += 1;
    }
    const alerts = telemetry
      .map((m: any) => ({ metric: m.metric, ...evaluateMetric(m.metric, m.value) }))
      .filter((a: any) => a.severity !== "ok");

    return {
      generatedAt: new Date().toISOString(),
      thread,
      counts: {
        messages: messages.length,
        userMessages: messages.filter((m: any) => m.role === "user").length,
        assistantMessages: messages.filter((m: any) => m.role === "assistant").length,
        tools: tools.length,
        runs: runs.length,
        feedback: feedback.length,
        thumbsUp: feedback.filter((f: any) => f.rating === "up").length,
        thumbsDown: feedback.filter((f: any) => f.rating === "down").length,
      },
      totalTokens,
      avgStreamMs,
      toolBreakdown: toolCounts,
      alerts,
      telemetry,
      messages: messages.map((m: any) => ({
        role: m.role,
        text: Array.isArray(m.parts)
          ? m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n").slice(0, 4000)
          : String(m.parts ?? ""),
        created_at: m.created_at,
      })),
      tools,
      runs,
      feedback,
    };
  });
