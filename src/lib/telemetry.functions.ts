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
