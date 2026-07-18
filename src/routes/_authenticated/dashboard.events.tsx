import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { getThreadEvents } from "@/lib/events.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, MessageSquare, RefreshCcw, Search, X } from "lucide-react";

const ALL_STATUSES = ["ok", "degraded", "unavailable", "error"] as const;
type StatusKey = (typeof ALL_STATUSES)[number];

const EventsSearch = z.object({
  from: z.string(),
  to: z.string(),
  stadium: z.string().optional(),
  tool: z.string().optional(),
  statuses: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard/events")({
  validateSearch: (s) => EventsSearch.parse(s),
  component: EventsDrilldown,
  head: () => ({
    meta: [
      { title: "StadSpear · Event drilldown" },
      { name: "description", content: "Underlying tool executions for a selected dashboard bucket." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function statusTone(s: string) {
  if (s === "ok") return "bg-primary/15 text-primary border-primary/30";
  if (s === "degraded") return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  if (s === "unavailable") return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-pink-500/15 text-pink-400 border-pink-500/30";
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventsDrilldown() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fn = useServerFn(getThreadEvents);
  const q = useQuery({
    queryKey: ["thread-events", search],
    queryFn: () =>
      fn({
        data: {
          fromIso: search.from,
          toIso: search.to,
          stadium: search.stadium,
          tool: search.tool,
          statuses: search.statuses,
          limit: 200,
        },
      }),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const data = q.data;
  const s = data?.summary;

  const [query, setQuery] = useState("");
  const [toolFilter, setToolFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(new Set());

  const toolOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of data?.groups ?? []) for (const ev of g.events) set.add(ev.tool_name);
    return Array.from(set).sort();
  }, [data]);

  const filteredGroups = useMemo(() => {
    const groups = data?.groups ?? [];
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        events: g.events.filter((ev) => {
          if (toolFilter && ev.tool_name !== toolFilter) return false;
          if (statusFilter.size && !statusFilter.has(ev.status as StatusKey)) return false;
          if (q && !(ev.error_message ?? "").toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((g) => g.events.length > 0);
  }, [data, query, toolFilter, statusFilter]);

  const filteredCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.events.length, 0),
    [filteredGroups],
  );

  const totalCount = useMemo(
    () => (data?.groups ?? []).reduce((n, g) => n + g.events.length, 0),
    [data],
  );

  const toggleStatus = (k: StatusKey) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const hasClientFilter = query.length > 0 || toolFilter.length > 0 || statusFilter.size > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">

      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground shrink-0">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              <span className="sr-only">Back to dashboard</span>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight truncate">Tool executions in this window</h1>
              <p className="text-xs text-muted-foreground truncate">
                {fmt(search.from)} → {fmt(search.to)}
                {search.stadium ? ` · ${search.stadium}` : " · all stadiums"}
                {search.tool ? ` · ${search.tool}` : ""}
                {search.statuses?.length ? ` · ${search.statuses.join(", ")}` : ""}
              </p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Refresh">
            <RefreshCcw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Events" value={s?.total ?? 0} />
          <Stat label="Ok" value={s?.ok ?? 0} />
          <Stat
            label="Fallback"
            value={`${s?.fallback ?? 0} (${((s?.fallbackRate ?? 0) * 100).toFixed(1)}%)`}
            tone={s && s.fallbackRate > 0.2 ? "warn" : "ok"}
          />
          <Stat label="Latency avg / p95" value={`${s?.avgLatencyMs ?? 0} / ${s?.p95LatencyMs ?? 0} ms`} />
        </section>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filters</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Showing {filteredCount} of {totalCount}
              {hasClientFilter && (
                <button
                  onClick={() => {
                    setQuery("");
                    setToolFilter("");
                    setStatusFilter(new Set());
                  }}
                  className="ml-3 inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 hover:bg-muted/50"
                >
                  <X className="h-3 w-3" aria-hidden /> Clear
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search error notes…"
                className="pl-9"
                aria-label="Search error notes"
              />
            </div>
            <select
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              aria-label="Filter by tool"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All tools</option>
              {toolOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {ALL_STATUSES.map((k) => {
                const active = statusFilter.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleStatus(k)}
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      active ? statusTone(k) : "border-border/60 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
          {(search.tool || search.statuses?.length) && (
            <div className="flex flex-wrap gap-2 text-xs pt-1 border-t border-border/40">
              <span className="text-muted-foreground">From URL:</span>
              {search.tool && (
                <button
                  onClick={() => navigate({ to: "/dashboard/events", search: { ...search, tool: undefined } })}
                  className="rounded-full border border-border/60 px-3 py-0.5 hover:bg-muted/50"
                >
                  Clear tool: {search.tool} ✕
                </button>
              )}
              {search.statuses?.length ? (
                <button
                  onClick={() => navigate({ to: "/dashboard/events", search: { ...search, statuses: undefined } })}
                  className="rounded-full border border-border/60 px-3 py-0.5 hover:bg-muted/50"
                >
                  Clear status: {search.statuses.join(", ")} ✕
                </button>
              ) : null}
            </div>
          )}
        </Card>

        {q.isLoading ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Loading events…</Card>
        ) : filteredGroups.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            {totalCount === 0
              ? "No tool executions matched this window. Widen the time range or clear filters."
              : "No events match the current filters."}
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((g) => (
              <Card key={g.threadId ?? "__none__"} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="truncate">{g.threadTitle ?? "Untitled thread"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      {g.stadium && <span>Stadium · {g.stadium}</span>}
                      {g.match && <span>Match · {g.match}</span>}
                      {g.role && <span>Role · {g.role}</span>}
                      <span>{g.events.length} event{g.events.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  {g.threadId && (
                    <Link
                      to="/hub/$threadId"
                      params={{ threadId: g.threadId }}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Open thread →
                    </Link>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2">Time</th>
                        <th className="px-4 py-2">Tool</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Latency</th>
                        <th className="px-4 py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.events.map((ev) => (
                        <tr key={ev.id} className="border-t border-border/40 align-top">
                          <td className="px-4 py-2 whitespace-nowrap tabular-nums text-xs">{fmt(ev.created_at)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{ev.tool_name}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${statusTone(ev.status)}`}>
                              {ev.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 tabular-nums text-xs">
                            {ev.latency_ms != null ? `${ev.latency_ms} ms` : "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-[420px]">
                            <span className="line-clamp-2">{ev.error_message ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {tone === "warn" && <Badge variant="destructive" className="text-[10px]">warn</Badge>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}
