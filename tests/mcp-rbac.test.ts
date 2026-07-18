import { describe, expect, it } from "vitest";
import { forbiddenToolResponse, requirePrivilegedRole } from "@/lib/mcp/rbac";

type FakeCtx = {
  isAuthenticated: () => boolean;
  getClaims: () => unknown;
  getToken: () => string;
  getUserId: () => string;
  getUserEmail: () => string | undefined;
  getClientId: () => string | undefined;
};

function ctx(claims: unknown, authenticated = true): FakeCtx {
  return {
    isAuthenticated: () => authenticated,
    getClaims: () => claims,
    getToken: () => "test-token",
    getUserId: () => "user-1",
    getUserEmail: () => "u@example.com",
    getClientId: () => "client-1",
  };
}

describe("MCP RBAC — requirePrivilegedRole", () => {
  it("refuses unauthenticated callers", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({}, false) as any);
    expect(res.ok).toBe(false);
  });

  it("accepts ops role from app_metadata.role", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({ app_metadata: { role: "ops" } }) as any);
    expect(res).toEqual({ ok: true, role: "ops" });
  });

  it("accepts volunteer role from app_metadata.roles[0]", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({ app_metadata: { roles: ["volunteer", "fan"] } }) as any);
    expect(res).toEqual({ ok: true, role: "volunteer" });
  });

  it("rejects user_metadata role (prevents self-elevation)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({ user_metadata: { role: "volunteer" } }) as any);
    expect(res.ok).toBe(false);
  });

  it("prefers app_metadata over user_metadata (fan cannot self-elevate)", () => {
    const res = requirePrivilegedRole(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx({ app_metadata: { role: "fan" }, user_metadata: { role: "ops" } }) as any,
    );
    expect(res.ok).toBe(false);
  });

  it("refuses fan role", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({ app_metadata: { role: "fan" } }) as any);
    expect(res.ok).toBe(false);
  });

  it("refuses missing claims", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx(undefined) as any);
    expect(res.ok).toBe(false);
  });

  it("refuses unknown role strings", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = requirePrivilegedRole(ctx({ app_metadata: { role: "admin" } }) as any);
    expect(res.ok).toBe(false);
  });
});

describe("MCP RBAC — forbiddenToolResponse", () => {
  it("produces a structured MCP error payload", () => {
    const r = forbiddenToolResponse("nope");
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toEqual({ status: "forbidden", note: "nope" });
    expect(r.content[0].type).toBe("text");
    expect(JSON.parse(r.content[0].text)).toEqual({ status: "forbidden", note: "nope" });
  });
});
