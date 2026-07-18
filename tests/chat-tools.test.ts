import { describe, it, expect, vi } from "vitest";
import {
  getStadiumTelemetry,
  getWayfindingRoute,
  getTransitOptions,
  getSustainabilityTip,
  getCrowdSafetyBriefing,
} from "@/lib/chat-tools";

function mockFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  return vi.fn(async () =>
    ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    } as unknown as Response),
  );
}

describe("getStadiumTelemetry", () => {
  const env = { supabaseUrl: "https://example.supabase.co", supabaseKey: "sb_publishable_test" };

  it("returns ok with rows when telemetry present", async () => {
    const fetchFn = mockFetch({
      ok: true,
      body: [{ metric: "gate_wait", value: 12, generated_at: "2026-06-15T00:00:00Z" }],
    });
    const res = await getStadiumTelemetry("MetLife", { ...env, fetchFn });
    expect(res.status).toBe("ok");
    expect((res as any).metrics).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("returns degraded with fallback when no rows are cached", async () => {
    const fetchFn = mockFetch({ ok: true, body: [] });
    const res = await getStadiumTelemetry("SoFi", { ...env, fetchFn });
    expect(res.status).toBe("degraded");
    expect((res as any).fallback).toMatchObject({ gate_wait: expect.any(String) });
  });

  it("returns unavailable when the telemetry endpoint errors", async () => {
    const fetchFn = mockFetch({ ok: false, status: 503 });
    const res = await getStadiumTelemetry("Azteca", { ...env, fetchFn });
    expect(res.status).toBe("unavailable");
    expect((res as any).note).toMatch(/unreachable|unavailable/i);
  });

  it("returns unavailable when fetch throws (network down)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await getStadiumTelemetry("MetLife", { ...env, fetchFn });
    expect(res.status).toBe("unavailable");
    expect((res as any).error).toContain("ECONNREFUSED");
  });

  it("returns unavailable when env vars are missing", async () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    try {
      const res = await getStadiumTelemetry("MetLife", {
        fetchFn: mockFetch({ ok: true, body: [] }),
      });
      expect(res.status).toBe("unavailable");
    } finally {
      if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
      if (prevKey !== undefined) process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
    }
  });
});

describe("getWayfindingRoute", () => {
  it("returns an ok route with steps for standard inputs", () => {
    const res = getWayfindingRoute("Gate A", "Section 218");
    expect(res.status).toBe("ok");
    expect((res as any).steps.length).toBeGreaterThan(0);
    expect((res as any).accessible).toBe(true);
  });

  it("returns a degraded fallback route when live routing is unavailable", () => {
    // seed=(from+to).length % 7 === 0 → 14 chars total triggers the fallback branch.
    const res = getWayfindingRoute("abcdefg", "1234567");
    expect(res.status).toBe("degraded");
    expect((res as any).fallback.steps).toContain("Head to the nearest concourse");
  });
});

describe("getTransitOptions", () => {
  it("returns multiple modes with accessibility flagged", () => {
    const res = getTransitOptions("MetLife", "Manhattan");
    expect(res.status).toBe("ok");
    const opts = (res as any).options;
    expect(opts).toHaveLength(3);
    expect(opts.every((o: any) => o.accessible)).toBe(true);
    expect(opts[0].line).toBe("NJ Transit");
  });

  it("swaps the rail line for non-MetLife stadiums", () => {
    const res = getTransitOptions("Azteca", "Centro");
    expect((res as any).options[0].line).toBe("Metro K");
  });
});

describe("getSustainabilityTip", () => {
  it("returns a stadium-specific tip", () => {
    const res = getSustainabilityTip("SoFi");
    expect(res.status).toBe("ok");
    expect((res as any).tip).toContain("SoFi");
  });
});

describe("getCrowdSafetyBriefing", () => {
  it("returns ok briefing with density, ADA guidance, and recommendedAction", () => {
    const res = getCrowdSafetyBriefing("MetLife", "Section 218");
    expect(res.status).toBe("ok");
    expect((res as any).density).toMatch(/low|moderate|elevated|high/);
    expect((res as any).adaGuidance).toBeTruthy();
    expect((res as any).recommendedAction).toBeTruthy();
    expect(typeof (res as any).chokePoint).toBe("boolean");
  });

  it("degrades to a conservative advisory when the live feed is stale", () => {
    // Find any (stadium, zone) whose seed % 9 === 0 by brute force.
    const stadiums = ["MetLife", "SoFi", "Azteca", "AT&T", "BMO"];
    let degraded: any = null;
    outer: for (const s of stadiums) {
      for (let i = 0; i < 200; i++) {
        const res = getCrowdSafetyBriefing(s, `Gate ${i}`);
        if (res.status === "degraded") { degraded = res; break outer; }
      }
    }
    expect(degraded).not.toBeNull();
    expect(degraded.fallback.adaGuidance).toMatch(/wheelchair|ramp/i);
    expect(degraded.fallback.recommendedAction).toBeTruthy();
    expect(degraded.note).toMatch(/stale|conservative/i);
  });

  it("flags chokePoint on elevated/high density", () => {
    // Sample many zones — at least one should be a choke point.
    const flagged = Array.from({ length: 30 }, (_, i) =>
      getCrowdSafetyBriefing("SoFi", `Zone ${i}`),
    ).some((r) => (r as any).chokePoint === true);
    expect(flagged).toBe(true);
  });
});
