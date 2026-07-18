// Shared client/server constants for StadSpear.

export const STADIUMS = [
  { id: "MetLife", name: "MetLife Stadium", city: "New York / New Jersey" },
  { id: "SoFi", name: "SoFi Stadium", city: "Los Angeles" },
  { id: "AT&T", name: "AT&T Stadium", city: "Dallas" },
  { id: "Azteca", name: "Estadio Azteca", city: "Mexico City" },
  { id: "BMO", name: "BMO Field", city: "Toronto" },
] as const;

export const ROLES = [
  { id: "fan", label: "Fan", description: "Match-day navigation & concierge" },
  { id: "volunteer", label: "Volunteer", description: "Shift briefings & guest assistance" },
  { id: "ops", label: "Ops staff", description: "Crowd, transit, and safety intelligence" },
] as const;

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
  { id: "ar", label: "العربية" },
  { id: "ja", label: "日本語" },
  { id: "hi", label: "हिन्दी" },
  { id: "de", label: "Deutsch" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];
export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

// ---- Alert thresholds ----
// Severity: "ok" | "warn" | "critical"
export type Severity = "ok" | "warn" | "critical";

export function evaluateMetric(
  metric: string,
  value: unknown,
): { severity: Severity; note?: string } {
  const v = (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
  const num = (key: string, fallback: number) => {
    const raw = v?.[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  if (!v) return { severity: "ok" };
  switch (metric) {
    case "gate_wait": {
      const m = num("minutes", 0);
      if (m >= 25) return { severity: "critical", note: `Gate wait ${m} min — open overflow lanes` };
      if (m >= 15) return { severity: "warn", note: `Gate wait ${m} min — monitor` };
      return { severity: "ok" };
    }
    case "concourse_density": {
      const p = num("percent", 0);
      if (p >= 85) return { severity: "critical", note: `Concourse ${p}% — reroute egress` };
      if (p >= 70) return { severity: "warn", note: `Concourse ${p}% — warn stewards` };
      return { severity: "ok" };
    }
    case "transit_eta": {
      const m = num("minutes", 0);
      if (m >= 20) return { severity: "warn", note: `Transit ${m} min — publish shuttle info` };
      return { severity: "ok" };
    }
    case "ada_restrooms": {
      const a = num("available", 99);
      if (a <= 1) return { severity: "critical", note: `Only ${a} ADA restroom open` };
      if (a <= 3) return { severity: "warn", note: `${a} ADA restrooms open` };
      return { severity: "ok" };
    }
    case "eco_points": {
      const s = num("score", 100);
      if (s < 40) return { severity: "critical", note: `Sustainability ${s}/100` };
      if (s < 60) return { severity: "warn", note: `Sustainability ${s}/100` };
      return { severity: "ok" };
    }
  }
  return { severity: "ok" };
}
