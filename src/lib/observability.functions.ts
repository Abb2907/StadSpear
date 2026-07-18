import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { summarizeObservability } from "./thread-service";

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      thread_id: z.string().uuid().nullable().optional(),
      message_id: z.string().max(120).nullable().optional(),
      rating: z.enum(["up", "down"]),
      reason: z.string().max(400).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("feedback").insert({
      user_id: context.userId,
      thread_id: data.thread_id ?? null,
      message_id: data.message_id ?? null,
      rating: data.rating,
      reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getObservabilitySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [runsRes, toolsRes, feedbackRes] = await Promise.all([
      context.supabase
        .from("ai_gateway_runs")
        .select("id, model, total_tokens, stream_duration_ms, status, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("tool_events")
        .select("id, tool_name, status, latency_ms, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase.from("feedback").select("rating").limit(500),
    ]);
    const runs = runsRes.data ?? [];
    const tools = toolsRes.data ?? [];
    const feedback = feedbackRes.data ?? [];
    return {
      runs,
      tools,
      summary: summarizeObservability(runs, tools, feedback),
    };
  });
