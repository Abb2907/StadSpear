import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, Radio, Languages, Accessibility, Bus, Leaf, LineChart, ArrowRight } from "lucide-react";
import heroStadium from "@/assets/hero-stadium.jpg";
import mark from "@/assets/stadspear-mark.png";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "StadSpear — FIFA 2026 Operational Control Tower" },
      { name: "description", content: "GenAI-powered stadium ops hub: multilingual concierge, live crowd telemetry, accessibility routing, and real-time decision support for the FIFA World Cup 2026." },
      { property: "og:title", content: "StadSpear — FIFA 2026 Operational Control Tower" },
      { property: "og:description", content: "One GenAI control tower for fans, volunteers, and ops staff during FIFA World Cup 2026." },
      { property: "og:url", content: "https://stadspear.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://stadspear.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "StadSpear",
          url: "https://stadspear.lovable.app/",
          description: "GenAI-powered FIFA 2026 stadium operational control tower for fans, volunteers, and ops staff.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "StadSpear",
          url: "https://stadspear.lovable.app/",
          description: "StadSpear is a GenAI operational control tower that unifies multilingual concierge, live crowd telemetry, accessibility routing, transit, and sustainability guidance for FIFA World Cup 2026 stadium operations.",
        }),
      },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/hub" });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={mark} alt="StadSpear mark" width={32} height={32} className="rounded-md" />
            <span className="text-lg font-bold tracking-tight">StadSpear</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">Operational Control Tower</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Button asChild size="sm"><Link to="/auth">Enter tower <ArrowRight className="ml-1 size-4" /></Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img src={heroStadium} alt="Stadium at dusk" width={1600} height={900}
             className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 grid-tower opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="pulse-dot inline-block size-2 rounded-full bg-primary" />
              FIFA World Cup 2026 · Live ops surface
            </div>
            <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-7xl">
              One hub.<br />
              <span className="text-primary">Every signal.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              StadSpear turns fragmented stadium data into a single GenAI-powered control tower — for fans, volunteers, and ops staff.
              Multilingual concierge, live crowd telemetry, ADA routing, and decision support in real time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/auth">Enter the tower <ArrowRight className="ml-1 size-4" /></Link></Button>
              <Button size="lg" variant="outline" asChild><a href="#capabilities">See capabilities</a></Button>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Capabilities</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Every problem-statement pillar, one surface.</h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Radio, title: "Live crowd telemetry", body: "Real-time gate waits, concourse density, and choke-point alerts, with graceful fallback to cached values when sensors drop." },
            { icon: Languages, title: "Multilingual concierge", body: "Answers in 8+ languages, matching the fan's own message. Trained on stadium-specific ops context." },
            { icon: Accessibility, title: "Accessibility routing", body: "ADA-safe walking paths, restroom availability, and volunteer escort dispatch on request." },
            { icon: Bus, title: "Transit intelligence", body: "Next-departure ETAs for rail, shuttle, and rideshare — with wheelchair-accessible options surfaced first." },
            { icon: Leaf, title: "Sustainability nudges", body: "Actionable tips per stadium: recycling bins, hydration stations, low-carbon transit choices." },
            { icon: LineChart, title: "Ops observability", body: "Every AI turn logged with latency, tokens, tool status, and user feedback for continuous improvement." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="group rounded-xl border border-border bg-surface/60 p-6 transition hover:border-primary/40 hover:bg-surface">
              <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-border/60 bg-surface/50">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:grid-cols-3">
          {[
            { k: "8+", v: "languages supported by the concierge" },
            { k: "<2s", v: "average AI first-token latency" },
            { k: "100%", v: "row-level security on user data" },
          ].map(({ k, v }) => (
            <div key={k}>
              <div className="text-4xl font-bold text-primary">{k}</div>
              <p className="mt-1 text-sm text-muted-foreground">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 px-6 py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2"><Shield className="size-3.5" /> StadSpear · Independent hackathon project · Not affiliated with FIFA.</div>
          <div>© 2026 StadSpear</div>
        </div>
      </footer>
    </main>
  );
}
