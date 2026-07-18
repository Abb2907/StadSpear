import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/browser-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Loader2 } from "lucide-react";
import mark from "@/assets/stadspear-mark.png";

// Beta auth.oauth namespace — typed shim so TS sees the three methods we use.
type OAuthClient = { name?: string; client_uri?: string; redirect_uris?: string[] };
type OAuthDetails = { client?: OAuthClient; scopes?: string[]; redirect_url?: string; redirect_to?: string };
type OAuthResult = { redirect_url?: string; redirect_to?: string };
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <Card className="max-w-md p-6 border-border">
        <h1 className="text-lg font-semibold">Couldn't load this authorization</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an external app";
  const scopes = details?.scopes ?? [];

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 grid-tower opacity-30" />
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-border bg-surface p-8">
          <div className="flex items-center gap-3">
            <img src={mark} alt="" width={40} height={40} className="rounded-md" />
            <div>
              <h1 className="text-lg font-bold">StadSpear</h1>
              <p className="text-xs text-muted-foreground">Agent integration request</p>
            </div>
          </div>

          <h2 className="mt-8 text-xl font-bold tracking-tight">
            Connect {clientName} to your StadSpear account
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} will be able to call StadSpear's enabled MCP tools while you are signed in — including reading your saved concierge threads and messages.
          </p>

          <ul className="mt-6 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 rounded-full bg-primary" />
              <span>Share your basic profile and email</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 rounded-full bg-primary" />
              <span>Use StadSpear stadium telemetry, wayfinding, transit and sustainability tools</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 rounded-full bg-primary" />
              <span>Read your own StadSpear threads and messages (subject to row-level security)</span>
            </li>
            {scopes.filter((s: string) => !["openid", "email", "profile"].includes(s)).map((s: string) => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-1 size-1.5 rounded-full bg-yellow-400" />
                <span>Additional permission requested: <code className="text-xs">{s}</code></span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-muted-foreground">
            This does not bypass StadSpear's permissions or backend policies.
          </p>

          {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 flex gap-3">
            <Button onClick={() => decide(true)} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
            </Button>
            <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">
              Cancel connection
            </Button>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <Shield className="size-3" /> Encrypted · row-level secured · your data is yours
          </p>
        </Card>
      </div>
    </main>
  );
}
