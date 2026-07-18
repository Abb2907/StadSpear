import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

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
          "- Use the provided tools to fetch live data when relevant (wayfinding, telemetry, ADA, transit, sustainability).",
          "- If a tool returns { degraded: true } or { status: 'unavailable' }, tell the user briefly that live data is temporarily unavailable and offer the best-effort fallback the tool returned.",
          "- Never invent gate numbers, wait times, or transit ETAs. Prefer tool output.",
          "- Format important operational data as short bullet points. Avoid walls of text.",
        ].join("\n");

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-2.5-flash");

        const tools = {
          getStadiumTelemetry: tool({
            description: "Get current crowd density, gate wait times, transit ETA, ADA restroom availability, and sustainability score for the active stadium.",
            inputSchema: z.object({
              stadium: z.string().describe("Stadium id, e.g. MetLife, SoFi, Azteca"),
            }),
            execute: async ({ stadium: s }) => {
              try {
                const supaUrl = process.env.SUPABASE_URL;
                const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
                if (!supaUrl || !supaKey) throw new Error("no-env");
                const res = await fetch(
                  `${supaUrl}/rest/v1/telemetry_cache?stadium=eq.${encodeURIComponent(s)}&select=metric,value,generated_at`,
                  { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
                );
                if (!res.ok) throw new Error(`status ${res.status}`);
                const rows = (await res.json()) as Array<{ metric: string; value: unknown; generated_at: string }>;
                if (rows.length === 0) {
                  return { status: "degraded", note: "No telemetry cached — showing best-effort static defaults.", fallback: { gate_wait: "≈15 min", concourse_density: "medium" } };
                }
                return { status: "ok", stadium: s, metrics: rows };
              } catch (e) {
                return { status: "unavailable", note: "Telemetry service unreachable. Best-effort: expect ≈15 min gate wait and medium concourse density in the hour before kickoff.", error: String(e) };
              }
            },
          }),
          getWayfindingRoute: tool({
            description: "Compute a walking route inside the stadium from one landmark (gate/section/amenity) to another.",
            inputSchema: z.object({
              from: z.string().describe("Origin, e.g. 'Gate A', 'Section 112', 'Main entrance'"),
              to: z.string().describe("Destination, e.g. 'Section 218', 'ADA restroom', 'Team store'"),
            }),
            execute: async ({ from, to }) => {
              // Simulated route service. In production, plug in Mapbox/HERE indoor routing.
              const seed = (from + to).length;
              if (seed % 7 === 0) {
                return {
                  status: "degraded",
                  note: "Live indoor routing is temporarily unavailable. Here's a best-effort walking guide.",
                  fallback: {
                    from, to,
                    steps: ["Head to the nearest concourse", "Follow the ring counter-clockwise", "Look for wayfinding signage to your destination"],
                    estMinutes: 6,
                  },
                };
              }
              return {
                status: "ok",
                from, to,
                estMinutes: 4 + (seed % 5),
                accessible: true,
                steps: [
                  `Exit ${from} to the main concourse`,
                  "Turn right, keep the field on your left",
                  "Continue past the food court",
                  `Arrive at ${to} — look for the illuminated signage`,
                ],
              };
            },
          }),
          getTransitOptions: tool({
            description: "Return public transit options departing near the stadium, with next-departure ETA and accessibility.",
            inputSchema: z.object({ stadium: z.string(), toward: z.string().describe("Destination area or neighborhood") }),
            execute: async ({ stadium: s, toward }) => ({
              status: "ok",
              stadium: s, toward,
              options: [
                { mode: "rail", line: s === "MetLife" ? "NJ Transit" : "Metro K", eta: "9 min", accessible: true },
                { mode: "shuttle", line: "Fan Zone Loop", eta: "4 min", accessible: true },
                { mode: "rideshare", line: "Lot G pickup", eta: "12 min", accessible: true },
              ],
            }),
          }),
          getSustainabilityTip: tool({
            description: "Return an actionable sustainability tip tailored to the current stadium (recycling, hydration stations, low-impact transit).",
            inputSchema: z.object({ stadium: z.string() }),
            execute: async ({ stadium: s }) => ({
              status: "ok",
              tip: `At ${s}, use the marked blue bins on the concourse for recycling and refill at any of the 24 hydration stations. Taking the shuttle back saves ~1.4 kg CO₂ per fan.`,
            }),
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
            const bearer = request.headers.get("authorization");
            const supaUrl = process.env.SUPABASE_URL;
            const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
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
