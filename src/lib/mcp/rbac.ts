import type { ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

const PRIVILEGED_ROLES = new Set(["volunteer", "ops"]);

export type PrivilegedRoleCheck =
  | { ok: true; role: "volunteer" | "ops" }
  | { ok: false; reason: string };

/**
 * Resolve the caller's authoritative role for MCP tools that expose
 * operational stadium data. Reads role ONLY from admin-issued
 * `app_metadata` — never from `user_metadata`, which any signed-in user
 * can write via `supabase.auth.updateUser({ data: { role: 'ops' } })`.
 *
 * Priority order:
 *   1. `app_metadata.role` (admin/service-role issued)
 *   2. `app_metadata.roles[0]`
 *
 * Fails closed: any missing/unknown role returns `{ ok: false }`.
 */
export function requirePrivilegedRole(ctx: ToolContext): PrivilegedRoleCheck {
  if (!ctx.isAuthenticated()) {
    return { ok: false, reason: "Not authenticated" };
  }
  const claims = ctx.getClaims() as {
    app_metadata?: { role?: string; roles?: string[] };
  } | undefined;
  const claimed =
    claims?.app_metadata?.role ??
    claims?.app_metadata?.roles?.[0];
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
