import type { ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

const PRIVILEGED_ROLES = new Set(["volunteer", "ops"]);

export type PrivilegedRoleCheck =
  | { ok: true; role: "volunteer" | "ops" }
  | { ok: false; reason: string };

/**
 * Resolve the caller's authoritative role for MCP tools that expose
 * operational stadium data. Reads role from Supabase JWT claims — never
 * from tool arguments — so a fan account cannot pivot into operational
 * telemetry by relabeling itself.
 *
 * Priority order:
 *   1. `app_metadata.role` (admin-issued, immutable by the user)
 *   2. `app_metadata.roles[0]`
 *   3. `user_metadata.role`
 *
 * Fails closed: any missing/unknown role returns `{ ok: false }`.
 */
export function requirePrivilegedRole(ctx: ToolContext): PrivilegedRoleCheck {
  if (!ctx.isAuthenticated()) {
    return { ok: false, reason: "Not authenticated" };
  }
  const claims = ctx.getClaims() as {
    app_metadata?: { role?: string; roles?: string[] };
    user_metadata?: { role?: string };
  } | undefined;
  const claimed =
    claims?.app_metadata?.role ??
    claims?.app_metadata?.roles?.[0] ??
    claims?.user_metadata?.role;
  if (claimed === "ops" || claimed === "volunteer") {
    return { ok: true, role: claimed };
  }
  return {
    ok: false,
    reason:
      "This operational tool is restricted to authorized volunteer or ops accounts. Contact venue staff for briefing data.",
  };
}

/** Convenience: forbidden MCP tool response with structured payload. */
export function forbiddenToolResponse(reason: string) {
  const payload = { status: "forbidden" as const, note: reason };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

export function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Preserved constants for callers that want to inspect membership.
export const PRIVILEGED_MCP_ROLES = PRIVILEGED_ROLES;
