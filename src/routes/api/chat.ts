import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import * as chatTools from "@/lib/chat-tools";

type ChatBody = {
  messages?: UIMessage[];
  threadId?: string;
  role?: "fan" | "volunteer" | "ops";
  stadium?: string;
  language?: string;
};

const LANGS: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  ar: "Arabic", ja: "Japanese", hi: "Hindi", de: "German",
};

const ROLE_BRIEFS: Record<string, string> = {
  fan: "The user is a MATCH-DAY FAN. Prioritize wayfinding, entry gates, seat access, food, restrooms, transit, safety, and match info. Keep answers short and reassuring.",
  volunteer: "The user is a VOLUNTEER on shift. Give crisp operational guidance: guest assistance, ADA support, communication protocols, first-aid escalation. Cite steps as numbered checklists.",
  ops: "The user is OPS STAFF at the command post. Return operational intelligence: crowd density, choke-points, transit ETAs, incident recommendations. Be decisive and quantitative.",
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ChatBody;
        try { body = (await request.json()) as ChatBody; }
        catch { return new Response("Invalid JSON", { status: 400 }); }

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const role = body.role ?? "fan";
        const stadium = body.stadium ?? "MetLife";
        const language = body.language ?? "en";
        const langName = LANGS[language] ?? "English";

        const system = [
          "You are StadSpear, the AI concierge inside the FIFA World Cup 2026 operational control tower.",
          `Answer in ${langName} unless the user explicitly writes in another language — then match theirs.`,
          `Current stadium context: ${stadium}.`,
          ROLE_BRIEFS[role],
          "Rules:",
          "- Use the provided tools to fetch live data when relevant (wayfinding, telemetry, transit, sustainability, crowd-safety).",
          "- If a tool returns { degraded: true } or { status: 'unavailable' }, tell the user briefly that live data is temporarily unavailable and offer the best-effort fallback the tool returned.",
          "- Never invent gate numbers, wait times, or transit ETAs. Prefer tool output.",
          "- Format important operational data as short bullet points. Avoid walls of text.",
        ].join("\n");

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
