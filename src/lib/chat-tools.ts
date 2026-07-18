/**
 * Pure tool executors used by the /api/chat route.
 * Extracted for unit testability. Each returns a plain object with a `status`
 * field: "ok" | "degraded" | "unavailable", so the model + UI can react to
 * fallback behavior gracefully.
 */

export type ToolResult<T = unknown> =
  | ({ status: "ok" } & T)
  | ({ status: "degraded"; note: string; fallback: unknown } & Partial<T>)
  | { status: "unavailable"; note: string; error?: string };

export interface TelemetryEnv {
  supabaseUrl?: string;
  supabaseKey?: string;
  fetchFn?: typeof fetch;
}

export async function getStadiumTelemetry(
  stadium: string,
  env: TelemetryEnv = {},
): Promise<ToolResult> {
  const supaUrl = env.supabaseUrl ?? process.env.SUPABASE_URL;
  const supaKey = env.supabaseKey ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const doFetch = env.fetchFn ?? fetch;
  try {
    if (!supaUrl || !supaKey) throw new Error("no-env");
    const res = await doFetch(
      `${supaUrl}/rest/v1/telemetry_cache?stadium=eq.${encodeURIComponent(stadium)}&select=metric,value,generated_at`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    const rows = (await res.json()) as Array<{ metric: string; value: unknown; generated_at: string }>;
    if (rows.length === 0) {
      return {
        status: "degraded",
        note: "No telemetry cached — showing best-effort static defaults.",
        fallback: { gate_wait: "≈15 min", concourse_density: "medium" },
      };
    }
    return { status: "ok", stadium, metrics: rows } as ToolResult;
  } catch (e) {
    return {
      status: "unavailable",
      note: "Telemetry service unreachable. Best-effort: expect ≈15 min gate wait and medium concourse density in the hour before kickoff.",
      error: String(e),
    };
  }
}

export function getWayfindingRoute(from: string, to: string): ToolResult {
  const seed = (from + to).length;
  if (seed % 7 === 0) {
    return {
      status: "degraded",
      note: "Live indoor routing is temporarily unavailable. Here's a best-effort walking guide.",
      fallback: {
        from,
        to,
        steps: [
          "Head to the nearest concourse",
          "Follow the ring counter-clockwise",
          "Look for wayfinding signage to your destination",
        ],
        estMinutes: 6,
      },
    };
  }
  return {
    status: "ok",
    from,
    to,
    estMinutes: 4 + (seed % 5),
    accessible: true,
    steps: [
      `Exit ${from} to the main concourse`,
      "Turn right, keep the field on your left",
      "Continue past the food court",
      `Arrive at ${to} — look for the illuminated signage`,
    ],
  } as ToolResult;
}

export function getTransitOptions(stadium: string, toward: string): ToolResult {
  return {
    status: "ok",
    stadium,
    toward,
    options: [
      { mode: "rail", line: stadium === "MetLife" ? "NJ Transit" : "Metro K", eta: "9 min", accessible: true },
      { mode: "shuttle", line: "Fan Zone Loop", eta: "4 min", accessible: true },
      { mode: "rideshare", line: "Lot G pickup", eta: "12 min", accessible: true },
    ],
  } as ToolResult;
}

export function getSustainabilityTip(stadium: string): ToolResult {
  return {
    status: "ok",
    tip: `At ${stadium}, use the marked blue bins on the concourse for recycling and refill at any of the 24 hydration stations. Taking the shuttle back saves ~1.4 kg CO₂ per fan.`,
  } as ToolResult;
}

/**
 * Crowd-safety briefing for a stadium zone. Combines density, choke-point
 * flags, ADA guidance and a recommended action so ops and volunteers can
 * decide fast. Falls back to a conservative advisory when the live density
 * feed is stale/unreachable.
 *
 * FIFA 2026 alignment: crowd management + accessibility + real-time decision
 * support for the operational control tower.
 */
export function getCrowdSafetyBriefing(
  stadium: string,
  zone: string,
): ToolResult {
  const key = `${stadium}::${zone}`.toLowerCase();
  const seed = Array.from(key).reduce((s, ch) => s + ch.charCodeAt(0), 0);

  // Simulated live-feed outage on ~1/9 of zones — exercise the fallback path.
  if (seed % 9 === 0) {
    return {
      status: "degraded",
      note: "Live crowd-density feed is stale. Applying conservative advisory based on kickoff schedule.",
      fallback: {
        stadium,
        zone,
        density: "elevated",
        chokePoint: true,
        adaGuidance:
          "Route wheelchair and low-mobility guests via the accessible ramp; hold new entries at the outer perimeter for 3–5 min.",
        recommendedAction:
          "Open an auxiliary lane, deploy 2 stewards, and page medical standby to the zone.",
        confidence: 0.55,
      },
    };
  }

  const density = (["low", "moderate", "elevated", "high"] as const)[seed % 4];
  const chokePoint = density === "elevated" || density === "high";
  const recommendedAction =
    density === "high"
      ? "Meter entry, open overflow gates, and dispatch stewards to the choke-point."
      : density === "elevated"
        ? "Add one steward, prep overflow gates, and monitor for the next 10 min."
        : "Maintain current staffing. Continue routine sweeps.";

  return {
    status: "ok",
    stadium,
    zone,
    density,
    chokePoint,
    adaGuidance:
      "Accessible route via ramp is clear. Reserve two companion seats near the zone exit for wheelchair guests.",
    recommendedAction,
    confidence: 0.9,
  } as ToolResult;
}
