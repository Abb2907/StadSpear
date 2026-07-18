import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import * as chatTools from "@/lib/chat-tools";

// Strict input schema — guards the system prompt against LLM injection via
// role/stadium/language field smuggling and caps request size.
const BodySchema = z.object({
  messages: z.array(z.any()).min(1).max(200),
  threadId: z.string().uuid().optional(),
  role: z.enum(["fan", "volunteer", "ops"]).default("fan"),
  stadium: z.string().min(1).max(64).default("MetLife"),
  language: z.enum(["en", "es", "fr", "pt", "ar", "ja", "hi", "de"]).default("en"),
});

const LANGS: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  ar: "Arabic", ja: "Japanese", hi: "Hindi", de: "German",
};

const ROLE_BRIEFS: Record<string, string> = {
  fan: "The user is a MATCH-DAY FAN. Prioritize wayfinding, entry gates, seat access, food, restrooms, transit, safety, and match info. Keep answers short and reassuring.",
  volunteer: "The user is a VOLUNTEER on shift. Give crisp operational guidance: guest assistance, ADA support, communication protocols, first-aid escalation. Cite steps as numbered checklists.",
  ops: "The user is OPS STAFF at the command post. Return operational intelligence: crowd density, choke-points, transit ETAs, incident recommendations. Be decisive and quantitative.",
};

// Roles authorized to invoke privileged operational telemetry tools.
const PRIVILEGED_TOOLS = new Set(["getStadiumTelemetry", "getCrowdSafetyBriefing"]);
const PRIVILEGED_ROLES = new Set(["volunteer", "ops"]);

// Strip control chars, quotes and prompt-injection markers from short scalar
// fields we splice into the system prompt.
function sanitizeScalar(s: string, max = 64) {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["`\\]/g, "")
    .replace(/\{\{|\}\}/g, "")
    .replace(/<\|.*?\|>/g, "")
    .slice(0, max);
}

// Verify the caller's authoritative role from Supabase JWT user_metadata.
// Falls back to "fan" (least privilege) on any failure — never trusts client-declared role for privileged tools.
async function resolveAuthoritativeRole(bearer: string | null): Promise<"fan" | "volunteer" | "ops"> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!bearer || !supaUrl || !supaKey) return "fan";
  try {
    const res = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { apikey: supaKey, Authorization: bearer },
    });
    if (!res.ok) return "fan";
    const user = (await res.json()) as { user_metadata?: { role?: string }; app_metadata?: { role?: string; roles?: string[] } };
    const claimed =
      user.app_metadata?.role ??
      user.app_metadata?.roles?.[0] ??
      user.user_metadata?.role;
    return claimed === "ops" || claimed === "volunteer" ? claimed : "fan";
  } catch {
    return "fan";
  }
}


        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-2.5-flash");

        // Log a tool execution to tool_events (best-effort — never break UX).
        const bearer = request.headers.get("authorization");
        const supaUrl = process.env.SUPABASE_URL;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const logTool = async (
          toolName: string,
          started: number,
          status: string,
          errorMessage?: string | null,
        ) => {
          if (!bearer || !supaUrl || !supaKey) return;
          try {
            await fetch(`${supaUrl}/rest/v1/tool_events`, {
              method: "POST",
              headers: {
                apikey: supaKey,
                Authorization: bearer,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                thread_id: body.threadId ?? null,
                tool_name: toolName,
                status,
                latency_ms: Date.now() - started,
                error_message: errorMessage ?? null,
              }),
            });
          } catch { /* observability failure must not break UX */ }
        };

        const instrument = <TArgs, TResult extends { status?: string; note?: string; error?: string }>(
          toolName: string,
          fn: (args: TArgs) => Promise<TResult> | TResult,
        ) => async (args: TArgs): Promise<TResult> => {
          const t0 = Date.now();
          try {
            const out = await fn(args);
            const status = (out?.status as string) ?? "ok";
            const err = status === "ok" ? null : (out?.error ?? out?.note ?? null);
            void logTool(toolName, t0, status, err);
            return out;
          } catch (e) {
            void logTool(toolName, t0, "error", e instanceof Error ? e.message : String(e));
            throw e;
          }
        };

        const tools = {
          getStadiumTelemetry: tool({
            description: "Get current crowd density, gate wait times, transit ETA, ADA restroom availability, and sustainability score for the active stadium.",
            inputSchema: z.object({
              stadium: z.string().describe("Stadium id, e.g. MetLife, SoFi, Azteca"),
            }),
            execute: instrument("getStadiumTelemetry", ({ stadium: s }: { stadium: string }) => chatTools.getStadiumTelemetry(s)),
          }),
          getWayfindingRoute: tool({
            description: "Compute a walking route inside the stadium from one landmark (gate/section/amenity) to another.",
            inputSchema: z.object({
              from: z.string().describe("Origin, e.g. 'Gate A', 'Section 112', 'Main entrance'"),
              to: z.string().describe("Destination, e.g. 'Section 218', 'ADA restroom', 'Team store'"),
            }),
            execute: instrument("getWayfindingRoute", ({ from, to }: { from: string; to: string }) => chatTools.getWayfindingRoute(from, to)),
          }),
          getTransitOptions: tool({
            description: "Return public transit options departing near the stadium, with next-departure ETA and accessibility.",
            inputSchema: z.object({ stadium: z.string(), toward: z.string().describe("Destination area or neighborhood") }),
            execute: instrument("getTransitOptions", ({ stadium: s, toward }: { stadium: string; toward: string }) => chatTools.getTransitOptions(s, toward)),
          }),
          getSustainabilityTip: tool({
            description: "Return an actionable sustainability tip tailored to the current stadium (recycling, hydration stations, low-impact transit).",
            inputSchema: z.object({ stadium: z.string() }),
            execute: instrument("getSustainabilityTip", ({ stadium: s }: { stadium: string }) => chatTools.getSustainabilityTip(s)),
          }),
          getCrowdSafetyBriefing: tool({
            description: "Return a crowd-safety briefing for a stadium zone: density level, choke-point flag, ADA guidance, and a recommended operational action. Use this for volunteer/ops requests about crowding, safety, entry metering, or accessibility routing.",
            inputSchema: z.object({
              stadium: z.string().describe("Stadium id, e.g. MetLife, SoFi, Azteca"),
              zone: z.string().describe("Zone or gate, e.g. 'Gate B', 'North concourse', 'Section 210'"),
            }),
            execute: instrument(
              "getCrowdSafetyBriefing",
              ({ stadium: s, zone }: { stadium: string; zone: string }) =>
                chatTools.getCrowdSafetyBriefing(s, zone),
            ),
          }),
        };

        const started = Date.now();
        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(body.messages),
          tools,
          stopWhen: stepCountIs(50),
          onFinish: async ({ usage, finishReason }) => {
            // Best-effort observability write. Requires bearer; skip if missing.
            if (!bearer || !supaUrl || !supaKey) return;
            try {
              await fetch(`${supaUrl}/rest/v1/ai_gateway_runs`, {
                method: "POST",
                headers: {
                  apikey: supaKey,
                  Authorization: bearer,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal",
                },
                body: JSON.stringify({
                  thread_id: body.threadId ?? null,
                  model: "google/gemini-2.5-flash",
                  prompt_tokens: usage?.inputTokens ?? null,
                  completion_tokens: usage?.outputTokens ?? null,
                  total_tokens: usage?.totalTokens ?? null,
                  stream_duration_ms: Date.now() - started,
                  finish_reason: finishReason ?? null,
                  status: "ok",
                }),
              });
            } catch { /* observability failure must not break UX */ }
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          onError: (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("429")) return "The concierge is at capacity. Please retry in a moment.";
            if (msg.includes("402")) return "AI credits exhausted. Please top up your workspace to continue.";
            return "The AI concierge hit a snag. Try rephrasing or retry.";
          },
        });
      },
    },
  },
});
