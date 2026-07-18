import { describe, it, expect } from "vitest";
import { evaluateMetric, STADIUMS, ROLES, LANGUAGES, DEFAULT_MODEL } from "@/lib/stadspear";
import { cn } from "@/lib/utils";

describe("evaluateMetric", () => {
  it("returns ok when value missing or non-object", () => {
    expect(evaluateMetric("gate_wait", null).severity).toBe("ok");
    expect(evaluateMetric("gate_wait", 5 as unknown as object).severity).toBe("ok");
    expect(evaluateMetric("unknown_metric", { minutes: 999 }).severity).toBe("ok");
  });

  describe("gate_wait", () => {
    it("ok under 15", () => expect(evaluateMetric("gate_wait", { minutes: 10 }).severity).toBe("ok"));
    it("warn at 15-24", () => {
      const r = evaluateMetric("gate_wait", { minutes: 20 });
      expect(r.severity).toBe("warn");
      expect(r.note).toMatch(/20 min/);
    });
    it("critical at 25+", () => {
      const r = evaluateMetric("gate_wait", { minutes: 30 });
      expect(r.severity).toBe("critical");
      expect(r.note).toMatch(/overflow/);
    });
  });

  describe("concourse_density", () => {
    it("ok under 70%", () => expect(evaluateMetric("concourse_density", { percent: 50 }).severity).toBe("ok"));
    it("warn 70-84%", () => expect(evaluateMetric("concourse_density", { percent: 75 }).severity).toBe("warn"));
    it("critical 85%+", () => expect(evaluateMetric("concourse_density", { percent: 90 }).severity).toBe("critical"));
  });

  describe("transit_eta", () => {
    it("ok under 20 min", () => expect(evaluateMetric("transit_eta", { minutes: 10 }).severity).toBe("ok"));
    it("warn 20+ min", () => expect(evaluateMetric("transit_eta", { minutes: 25 }).severity).toBe("warn"));
  });

  describe("ada_restrooms", () => {
    it("ok when 4+ open", () => expect(evaluateMetric("ada_restrooms", { available: 5 }).severity).toBe("ok"));
    it("warn 2-3 open", () => expect(evaluateMetric("ada_restrooms", { available: 3 }).severity).toBe("warn"));
    it("critical 0-1 open", () => expect(evaluateMetric("ada_restrooms", { available: 1 }).severity).toBe("critical"));
  });

  describe("eco_points", () => {
    it("ok 60+", () => expect(evaluateMetric("eco_points", { score: 80 }).severity).toBe("ok"));
    it("warn 40-59", () => expect(evaluateMetric("eco_points", { score: 50 }).severity).toBe("warn"));
    it("critical <40", () => expect(evaluateMetric("eco_points", { score: 30 }).severity).toBe("critical"));
  });
});

describe("constants", () => {
  it("STADIUMS covers 5 host venues", () => {
    expect(STADIUMS).toHaveLength(5);
    expect(STADIUMS.map((s) => s.id)).toEqual(
      expect.arrayContaining(["MetLife", "SoFi", "AT&T", "Azteca", "BMO"]),
    );
  });
  it("ROLES has 3 personas", () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual(["fan", "ops", "volunteer"]);
  });
  it("LANGUAGES include at least English + Spanish + Arabic", () => {
    const ids = LANGUAGES.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["en", "es", "ar"]));
  });
  it("DEFAULT_MODEL is set to a Gemini flash model", () => {
    expect(DEFAULT_MODEL).toMatch(/gemini/);
  });
});

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("ignores falsy values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });
});
