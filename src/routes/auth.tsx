import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import mark from "@/assets/stadspear-mark.png";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: "Sign in · StadSpear" },
      { name: "description", content: "Sign in or create your StadSpear account to access the FIFA 2026 operational control tower — multilingual concierge, live telemetry, and ops observability." },
      { property: "og:title", content: "Sign in · StadSpear" },
      { property: "og:description", content: "Access the StadSpear FIFA 2026 operational control tower." },
      { property: "og:url", content: "https://stadspear.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://stadspear.lovable.app/auth" }],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const go = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/hub" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") go();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const returnTo = next ? `${window.location.origin}${next}` : window.location.origin;
      const { error } = await fn.call(supabase.auth, {
        email, password,
        ...(mode === "signup" ? { options: { emailRedirectTo: returnTo } } : {}),
      } as any);
      if (error) throw error;
      if (mode === "signup") toast.success("Account created. Check your inbox to confirm, then sign in.");
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const redirect_uri = window.location.origin;
      const result: any = await lovable.auth.signInWithOAuth("google", { redirect_uri });
      if (result?.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        setLoading(false);
        return;
      }
      if (result?.redirected) {
        // browser is navigating away
        return;
      }
      // Popup flow succeeded — confirm session and navigate explicitly.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        go();
        return;
      }
      toast.error("Sign-in did not complete. Please try again.");
      setLoading(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 grid-tower opacity-30" />
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-border bg-surface p-8">
          <div className="flex items-center gap-3">
            <img src={mark} alt="" width={40} height={40} className="rounded-md" />
            <div>
              <h1 className="text-lg font-bold">StadSpear</h1>
              <p className="text-xs text-muted-foreground">Operational Control Tower</p>
            </div>
          </div>

          <h2 className="mt-8 text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Sign in to the tower" : "Create your ops account"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Access your threads, telemetry, and briefings." : "One account for fan, volunteer, and ops surfaces."}
          </p>

          <Button onClick={handleGoogle} disabled={loading} variant="outline" className="mt-6 w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : (
              <><svg viewBox="0 0 24 24" className="mr-2 size-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google</>
            )}
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <Shield className="size-3" /> Encrypted · row-level secured · your data is yours
          </p>
        </Card>
      </div>
    </main>
  );
}
