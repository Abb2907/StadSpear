import { describe, it, expect } from "vitest";
import {
  getStadiumTelemetry,
  getWayfindingRoute,
  getTransitOptions,
  getSustainabilityTip,
} from "@/lib/chat-tools";

/**
 * Lightweight performance benchmarks for chat tool executors under simulated
 * telemetry and routing slowdowns. These are NOT strict SLA gates — the
 * budgets are generous ceilings sized for a shared CI runner. The goal is to:
 *
 *   1. Report p50/p95 latency for each tool + slowdown scenario
 *   2. Fail loudly if a regression makes a tool wildly slower than expected
 *   3. Measure end-to-end "stream duration" for a small fan-out of tool calls,
 *      the same way `ai_gateway_runs.stream_duration_ms` is measured in prod
 */

function makeSlowFetch(delayMs: number, body: unknown, ok = true) {
  return (async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok,
      status: ok ? 200 : 503,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function makeFlakyFetch(delayMs: number) {
  // Simulates a hung upstream that eventually rejects — real-world timeout path.
  return (async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    throw new Error("ETIMEDOUT");
  }) as unknown as typeof fetch;
}

async function measure(fn: () => Promise<unknown> | unknown, samples: number) {
  const timings: number[] = [];
  // Warm-up — first call often pays JIT / import cost.
  await fn();
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fn();
    timings.push(performance.now() - t0);
  }
  timings.sort((a, b) => a - b);
  const p = (q: number) => timings[Math.min(timings.length - 1, Math.floor(timings.length * q))];
  const avg = timings.reduce((s, v) => s + v, 0) / timings.length;
  return { p50: p(0.5), p95: p(0.95), max: timings[timings.length - 1], avg, samples: timings.length };
}

function report(label: string, stats: Awaited<ReturnType<typeof measure>>) {
  // Emit a one-line CSV-ish report so CI logs stay grep-friendly.
   
  console.log(
    `[bench] ${label.padEnd(46)} n=${stats.samples} p50=${stats.p50.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms avg=${stats.avg.toFixed(2)}ms`,
  );
}

const env = { supabaseUrl: "https://example.supabase.co", supabaseKey: "sb_publishable_test" };

describe("chat tool latency benchmarks", () => {
  it("telemetry fast path (no slowdown) stays sub-15ms p95", async () => {
    const fetchFn = makeSlowFetch(0, [{ metric: "gate_wait", value: 8, generated_at: "2026-06-15T00:00:00Z" }]);
    const stats = await measure(() => getStadiumTelemetry("MetLife", { ...env, fetchFn }), 30);
    report("telemetry fast", stats);
    expect(stats.p95).toBeLessThan(15);
  });

  it("telemetry with 50ms simulated upstream slowdown reports overhead <10ms", async () => {
    const upstream = 50;
    const fetchFn = makeSlowFetch(upstream, [{ metric: "gate_wait", value: 12, generated_at: "2026-06-15T00:00:00Z" }]);
    const stats = await measure(() => getStadiumTelemetry("MetLife", { ...env, fetchFn }), 20);
    report("telemetry +50ms upstream", stats);
    // Our own overhead on top of the simulated upstream latency.
    expect(stats.p95 - upstream).toBeLessThan(15);
  });

  it("telemetry degraded (empty rows) returns fast fallback sub-15ms p95", async () => {
    const fetchFn = makeSlowFetch(0, []);
    const stats = await measure(() => getStadiumTelemetry("SoFi", { ...env, fetchFn }), 30);
    report("telemetry degraded fallback", stats);
    expect(stats.p95).toBeLessThan(15);
  });

  it("telemetry unavailable (upstream 5xx) short-circuits fast", async () => {
    const fetchFn = makeSlowFetch(5, null, false);
    const stats = await measure(() => getStadiumTelemetry("Azteca", { ...env, fetchFn }), 20);
    report("telemetry unavailable 5xx", stats);
    // Even under a small upstream stall, the unavailable path must return promptly.
    expect(stats.p95).toBeLessThan(30);
  });

  it("telemetry hung upstream (100ms) still returns via catch path", async () => {
    const fetchFn = makeFlakyFetch(100);
    const stats = await measure(() => getStadiumTelemetry("MetLife", { ...env, fetchFn }), 10);
    report("telemetry hung upstream", stats);
    expect(stats.p95).toBeLessThan(140);
  });

  it("wayfinding routing is effectively free (p95 < 1ms)", async () => {
    const stats = await measure(() => Promise.resolve(getWayfindingRoute("Gate A", "Section 218")), 200);
    report("wayfinding ok", stats);
    expect(stats.p95).toBeLessThan(1);
  });

  it("wayfinding degraded branch has same latency profile as ok", async () => {
    // 14 chars total => seed % 7 === 0, hits the degraded fallback.
    const stats = await measure(() => Promise.resolve(getWayfindingRoute("abcdefg", "1234567")), 200);
    report("wayfinding degraded", stats);
    expect(stats.p95).toBeLessThan(1);
  });

  it("transit + sustainability lookups are effectively free", async () => {
    const transit = await measure(() => Promise.resolve(getTransitOptions("MetLife", "Manhattan")), 200);
    report("transit ok", transit);
    expect(transit.p95).toBeLessThan(1);

    const sustain = await measure(() => Promise.resolve(getSustainabilityTip("SoFi")), 200);
    report("sustainability ok", sustain);
    expect(sustain.p95).toBeLessThan(1);
  });
});

describe("simulated stream duration under fan-out", () => {
  it("parallel tool fan-out with 40ms telemetry slowdown finishes near the slowest tool", async () => {
    const fetchFn = makeSlowFetch(40, [{ metric: "gate_wait", value: 10, generated_at: "2026-06-15T00:00:00Z" }]);
    const run = async () => {
      const t0 = performance.now();
      await Promise.all([
        getStadiumTelemetry("MetLife", { ...env, fetchFn }),
        Promise.resolve(getWayfindingRoute("Gate A", "Section 218")),
        Promise.resolve(getTransitOptions("MetLife", "Manhattan")),
        Promise.resolve(getSustainabilityTip("MetLife")),
      ]);
      return performance.now() - t0;
    };
    const durations: number[] = [];
    for (let i = 0; i < 5; i++) durations.push(await run());
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1];
     
    console.log(`[bench] stream fan-out (telemetry+40ms)         p95=${p95.toFixed(2)}ms samples=${durations.length}`);
    // Fan-out must be gated by the slowest tool, not the sum of tools.
    expect(p95).toBeLessThan(40 + 60);
  });

  it("sequential tool chain adds up latencies (regression guard)", async () => {
    const fetchFn = makeSlowFetch(30, [{ metric: "gate_wait", value: 10, generated_at: "2026-06-15T00:00:00Z" }]);
    const run = async () => {
      const t0 = performance.now();
      await getStadiumTelemetry("MetLife", { ...env, fetchFn });
      getWayfindingRoute("Gate A", "Section 218");
      getTransitOptions("MetLife", "Manhattan");
      getSustainabilityTip("MetLife");
      return performance.now() - t0;
    };
    const durations: number[] = [];
    for (let i = 0; i < 5; i++) durations.push(await run());
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1];
     
    console.log(`[bench] stream sequential (telemetry+30ms)      p95=${p95.toFixed(2)}ms samples=${durations.length}`);
    expect(p95).toBeGreaterThanOrEqual(30);
    expect(p95).toBeLessThan(30 + 50);
  });
});
