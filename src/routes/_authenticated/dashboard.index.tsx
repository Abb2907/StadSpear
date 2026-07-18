import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getStadiumDashboard } from "@/lib/dashboard.functions";
import { STADIUMS } from "@/lib/stadspear";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Activity, AlertTriangle, ChevronLeft, Gauge, RefreshCcw, Timer } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "StadSpear · Live ops dashboard" },
      {
        name: "description",
        content: "Real-time tool latency, fallback rates, and AI stream duration for FIFA 2026 stadium threads.",
      },
    ],
  }),
});

const WINDOWS = [
  { m: 15, label: "15 min" },
  { m: 60, label: "1 hr" },
  { m: 240, label: "4 hr" },
  { m: 1440, label: "24 hr" },
];

const chartConfig = {
  avgMs: { label: "Avg (ms)", color: "hsl(var(--primary))" },
  p95Ms: { label: "p95 (ms)", color: "hsl(var(--destructive))" },
  fallbackRate: { label: "Fallback rate", color: "hsl(var(--accent-foreground, 200 90% 60%))" },
  count: { label: "Calls", color: "hsl(var(--muted-foreground))" },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function DashboardPage() {
  const dashFn = useServerFn(getStadiumDashboard);
  const [stadium, setStadium] = useState<string>("all");
  const [windowMin, setWindowMin] = useState<number>(60);

  const q = useQuery({
    queryKey: ["dashboard", stadium, windowMin],
    queryFn: () =>
      dashFn({
        data: {
          stadium: stadium === "all" ? undefined : stadium,
          sinceMinutes: windowMin,
          bucketMinutes: windowMin >= 240 ? 15 : windowMin >= 60 ? 5 : 1,
        },
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const data = q.data;
  const summary = data?.summary;
  const isEmpty = !q.isLoading && (data?.summary.totalCalls ?? 0) === 0 && (data?.summary.streamCount ?? 0) === 0;
  const bucketMinutes = data?.bucketMinutes ?? 5;
  const navigate = useNavigate();

  const openBucket = useCallback(
    (bucketIso: string, opts?: { tool?: string; statuses?: string[] }) => {
      const from = new Date(bucketIso).toISOString();
      const to = new Date(new Date(bucketIso).getTime() + bucketMinutes * 60_000).toISOString();
      navigate({
        to: "/dashboard/events",
        search: {
          from,
          to,
          stadium: stadium === "all" ? undefined : stadium,
          tool: opts?.tool,
          statuses: opts?.statuses,
        },
      });
    },
    [bucketMinutes, navigate, stadium],
  );

  const openTool = useCallback(
    (tool: string) => {
      const from = new Date(Date.now() - windowMin * 60_000).toISOString();
      const to = new Date().toISOString();
      navigate({
        to: "/dashboard/events",
        search: { from, to, stadium: stadium === "all" ? undefined : stadium, tool },
      });
    },
    [navigate, stadium, windowMin],
  );

  const chartClick = (fn: (bucket: string) => void) => (e: any) => {
    const label = e?.activeLabel;
    if (typeof label === "string") fn(label);
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/hub" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              <span className="sr-only">Back to hub</span>
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Live ops dashboard</h1>
              <p className="text-xs text-muted-foreground">
                Real-time AI tool latency, fallback rates, and stream duration across stadium threads.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={stadium} onValueChange={setStadium}>
              <SelectTrigger className="w-[180px]" aria-label="Stadium filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stadiums</SelectItem>
                {STADIUMS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-border/60 bg-card/40 p-0.5" role="tablist" aria-label="Time window">
              {WINDOWS.map((w) => (
                <button
                  key={w.m}
                  role="tab"
                  aria-selected={windowMin === w.m}
                  onClick={() => setWindowMin(w.m)}
                  className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                    windowMin === w.m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              aria-label="Refresh"
            >
              <RefreshCcw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        <div aria-live="polite" className="sr-only">
          {q.isFetching ? "Refreshing metrics" : `Metrics updated at ${new Date().toLocaleTimeString()}`}
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Activity className="h-4 w-4" aria-hidden />}
            label="Tool calls"
            value={summary?.totalCalls ?? 0}
            hint={`${summary?.totalFallback ?? 0} fell back`}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            label="Fallback rate"
            value={`${((summary?.fallbackRate ?? 0) * 100).toFixed(1)}%`}
            hint={summary && summary.fallbackRate > 0.2 ? "Above 20% threshold" : "Within nominal band"}
            tone={summary && summary.fallbackRate > 0.2 ? "warn" : "ok"}
          />
          <StatCard
            icon={<Timer className="h-4 w-4" aria-hidden />}
            label="Tool latency"
            value={`${summary?.avgLatencyMs ?? 0} ms`}
            hint={`p95 ${summary?.p95LatencyMs ?? 0} ms`}
          />
          <StatCard
            icon={<Gauge className="h-4 w-4" aria-hidden />}
            label="Stream duration"
            value={`${summary?.avgStreamMs ?? 0} ms`}
            hint={`p95 ${summary?.p95StreamMs ?? 0} ms · ${summary?.streamCount ?? 0} streams`}
          />
        </section>

        {isEmpty ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No telemetry yet in this window. Trigger a chat in the hub — tool executions and stream durations will
            stream in here within seconds.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Tool execution latency"
                subtitle={`Per ${data?.bucketMinutes ?? 5}-minute bucket · avg vs p95 (ms)`}
              >
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer>
                    <LineChart data={data?.toolLatency ?? []} onClick={chartClick((b) => openBucket(b))} style={{ cursor: "pointer" }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="bucket" tickFormatter={fmtTime} className="text-xs" />
                      <YAxis unit=" ms" className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtTime(String(v))} />} />
                      <Line type="monotone" dataKey="avgMs" stroke="var(--color-avgMs)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="p95Ms" stroke="var(--color-p95Ms)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </ChartCard>

              <ChartCard
                title="Fallback rate over time"
                subtitle="Share of tool calls that hit a degraded / unavailable path"
              >
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer>
                    <AreaChart data={data?.toolLatency ?? []} onClick={chartClick((b) => openBucket(b, { statuses: ["degraded", "unavailable", "error"] }))} style={{ cursor: "pointer" }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="bucket" tickFormatter={fmtTime} className="text-xs" />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} className="text-xs" />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(v) => fmtTime(String(v))}
                            formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="fallbackRate"
                        stroke="var(--color-fallbackRate)"
                        fill="var(--color-fallbackRate)"
                        fillOpacity={0.25}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </ChartCard>

              <ChartCard
                title="AI stream duration"
                subtitle={`Per ${data?.bucketMinutes ?? 5}-minute bucket · time-to-final-token (ms)`}
              >
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer>
                    <LineChart data={data?.streamDuration ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="bucket" tickFormatter={fmtTime} className="text-xs" />
                      <YAxis unit=" ms" className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtTime(String(v))} />} />
                      <Line type="monotone" dataKey="avgMs" stroke="var(--color-avgMs)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="p95Ms" stroke="var(--color-p95Ms)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </ChartCard>

              <ChartCard
                title="Calls per tool"
                subtitle="Volume by tool over the window"
              >
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer>
                    <BarChart data={data?.fallbackByTool ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="tool" className="text-xs" tick={{ fontSize: 11 }} />
                      <YAxis className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="ok" stackId="a" fill="hsl(var(--primary))" />
                      <Bar dataKey="degraded" stackId="a" fill="hsl(45 90% 55%)" />
                      <Bar dataKey="unavailable" stackId="a" fill="hsl(0 80% 60%)" />
                      <Bar dataKey="error" stackId="a" fill="hsl(340 80% 55%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </ChartCard>
            </div>

            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-3">Per-tool breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="py-2 pr-4">Tool</th>
                      <th className="py-2 pr-4">Calls</th>
                      <th className="py-2 pr-4">Ok</th>
                      <th className="py-2 pr-4">Degraded</th>
                      <th className="py-2 pr-4">Unavailable</th>
                      <th className="py-2 pr-4">Error</th>
                      <th className="py-2 pr-4">Avg latency</th>
                      <th className="py-2 pr-4">Fallback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.fallbackByTool ?? []).map((row) => (
                      <tr key={row.tool} className="border-t border-border/40">
                        <td className="py-2 pr-4 font-mono text-xs">{row.tool}</td>
                        <td className="py-2 pr-4">{row.total}</td>
                        <td className="py-2 pr-4">{row.ok}</td>
                        <td className="py-2 pr-4">{row.degraded}</td>
                        <td className="py-2 pr-4">{row.unavailable}</td>
                        <td className="py-2 pr-4">{row.error}</td>
                        <td className="py-2 pr-4">{row.avgLatencyMs} ms</td>
                        <td className="py-2 pr-4">
                          <Badge variant={row.fallbackRate > 0.2 ? "destructive" : "secondary"}>
                            {(row.fallbackRate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(data?.fallbackByTool ?? []).length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-muted-foreground text-xs">
                          No tool executions in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        {tone === "warn" && <Badge variant="destructive" className="text-[10px]">warn</Badge>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}
