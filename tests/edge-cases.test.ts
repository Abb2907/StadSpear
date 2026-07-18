import { describe, it, expect } from "vitest";
import {
  getWayfindingRoute,
  getTransitOptions,
  getSustainabilityTip,
  getCrowdSafetyBriefing,
} from "@/lib/chat-tools";
import { evaluateMetric } from "@/lib/stadspear";
import { cn } from "@/lib/utils";

describe("evaluateMetric — boundary and defensive cases", () => {
  it("treats undefined value as ok", () => {
    expect(evaluateMetric("gate_wait", undefined).severity).toBe("ok");
  });

  it("coerces string numbers into thresholds", () => {
    expect(evaluateMetric("gate_wait", { minutes: "26" }).severity).toBe("critical");
    expect(evaluateMetric("concourse_density", { percent: "70" }).severity).toBe("warn");
  });

  it("ignores non-numeric junk without throwing", () => {
    expect(evaluateMetric("gate_wait", { minutes: "n/a" }).severity).toBe("ok");
    expect(evaluateMetric("eco_points", { score: NaN }).severity).toBe("ok");
  });

  it("handles negative values gracefully (treats as ok / high)", () => {
    // Negative wait clearly not critical.
    expect(evaluateMetric("gate_wait", { minutes: -5 }).severity).toBe("ok");
    // Negative eco score is worse than 0 → critical.
    expect(evaluateMetric("eco_points", { score: -10 }).severity).toBe("critical");
  });

  it("exact threshold boundaries pick the higher severity", () => {
    expect(evaluateMetric("gate_wait", { minutes: 15 }).severity).toBe("warn");
    expect(evaluateMetric("gate_wait", { minutes: 25 }).severity).toBe("critical");
    expect(evaluateMetric("concourse_density", { percent: 85 }).severity).toBe("critical");
    expect(evaluateMetric("ada_restrooms", { available: 1 }).severity).toBe("critical");
    expect(evaluateMetric("ada_restrooms", { available: 4 }).severity).toBe("ok");
  });

  it("unknown metrics return ok regardless of value shape", () => {
    expect(evaluateMetric("nope", { minutes: 9999 }).severity).toBe("ok");
    expect(evaluateMetric("", { percent: 100 }).severity).toBe("ok");
  });
});

describe("chat tools — empty and unicode inputs", () => {
  it("wayfinding handles empty strings without throwing", () => {
    const res = getWayfindingRoute("", "");
    expect(["ok", "degraded"]).toContain(res.status);
  });

  it("transit handles unicode stadium names", () => {
    const res = getTransitOptions("Estádio 🇧🇷", "Centro");
    expect(res.status).toBe("ok");
    // Non-MetLife stadium → alternate rail line.
    expect((res as { options: { line: string }[] }).options[0].line).toBe("Metro K");
  });

  it("sustainability tip mentions the stadium verbatim", () => {
    const res = getSustainabilityTip("BMO");
    expect((res as { tip: string }).tip).toContain("BMO");
  });

  it("crowd safety briefing returns a numeric confidence in [0,1]", () => {
    const res = getCrowdSafetyBriefing("SoFi", "Section 100");
    const shape = res as { confidence?: number; fallback?: { confidence?: number } };
    const conf = shape.confidence ?? shape.fallback?.confidence ?? 0;
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThanOrEqual(1);
  });
});

describe("cn — extended cases", () => {
  it("returns empty string with no args", () => {
    expect(cn()).toBe("");
  });
  it("handles arrays and objects (clsx passthrough)", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});
