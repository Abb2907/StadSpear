import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/browser-client";
import { createThread, deleteThread, getThread, listThreads, saveMessage, updateThread } from "@/lib/threads.functions";
import { getTelemetry, tickTelemetry } from "@/lib/telemetry.functions";
import { getObservabilitySummary } from "@/lib/observability.functions";
import { getSessionReport } from "@/lib/session-report.functions";
import { ROLES, STADIUMS, LANGUAGES, evaluateMetric, type RoleId, type LanguageId, type Severity } from "@/lib/stadspear";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import mark from "@/assets/stadspear-mark.png";
import {
  Plus, Star, Trash2, Send, Loader2, LogOut, Radio, Users, Bus, Accessibility, Leaf, Activity,
  Menu, ChevronRight, ThumbsUp, ThumbsDown, Shield, Sparkles, AlertTriangle, FileText,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { submitFeedback } from "@/lib/observability.functions";

type ThreadRow = Awaited<ReturnType<typeof listThreads>>[number];

export function HubShell({ threadId }: { threadId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listFn = useServerFn(listThreads);
  const createFn = useServerFn(createThread);
  const getFn = useServerFn(getThread);
  const updateFn = useServerFn(updateThread);
  const deleteFn = useServerFn(deleteThread);
  const saveMsgFn = useServerFn(saveMessage);

  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => listFn() });
  const threadQ = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getFn({ data: { id: threadId } }),
    enabled: !!threadId,
  });

  const thread = threadQ.data?.thread;
  const initialMessages = useMemo<UIMessage[]>(() => {
    return (threadQ.data?.messages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role,
      parts: Array.isArray(m.parts) ? m.parts : [{ type: "text", text: String(m.parts ?? "") }],
    }));
  }, [threadQ.data]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <SidebarInner
          threads={threadsQ.data ?? []}
          activeId={threadId}
          onCreate={async () => {
            const t = await createFn({ data: { role: (thread?.role as RoleId) ?? "fan", language: (thread?.language as LanguageId) ?? "en", stadium: thread?.stadium ?? "MetLife" } });
            await qc.invalidateQueries({ queryKey: ["threads"] });
            if (t?.id) navigate({ to: "/hub/$threadId", params: { threadId: t.id } });
          }}
          onDelete={async (id) => {
            await deleteFn({ data: { id } });
            await qc.invalidateQueries({ queryKey: ["threads"] });
            if (id === threadId) navigate({ to: "/hub" });
          }}
          onToggleFav={async (id, favorite) => {
            await updateFn({ data: { id, favorite } });
            await qc.invalidateQueries({ queryKey: ["threads"] });
          }}
        />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-border bg-surface/60 px-4 py-3 backdrop-blur">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open threads">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-r border-border bg-sidebar p-0 text-sidebar-foreground">
              <SidebarInner
                threads={threadsQ.data ?? []}
                activeId={threadId}
                onCreate={async () => {
                  const t = await createFn({ data: { role: "fan", language: "en", stadium: "MetLife" } });
                  await qc.invalidateQueries({ queryKey: ["threads"] });
                  if (t?.id) navigate({ to: "/hub/$threadId", params: { threadId: t.id } });
                }}
                onDelete={async (id) => {
                  await deleteFn({ data: { id } });
                  await qc.invalidateQueries({ queryKey: ["threads"] });
                  if (id === threadId) navigate({ to: "/hub" });
                }}
                onToggleFav={async (id, favorite) => {
                  await updateFn({ data: { id, favorite } });
                  await qc.invalidateQueries({ queryKey: ["threads"] });
                }}
              />
            </SheetContent>
          </Sheet>

          <h1 className="sr-only">StadSpear Operational Control Tower</h1>
          <div className="flex items-center gap-2">
            <div className="pulse-dot size-2 rounded-full bg-primary" aria-hidden />
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Live · FIFA 2026</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {thread && (
              <>
                <RoleSelect
                  value={thread.role as RoleId}
                  onChange={async (v) => { await updateFn({ data: { id: threadId, role: v } }); qc.invalidateQueries({ queryKey: ["thread", threadId] }); qc.invalidateQueries({ queryKey: ["threads"] }); }}
                />
                <StadiumSelect
                  value={thread.stadium ?? "MetLife"}
                  onChange={async (v) => { await updateFn({ data: { id: threadId, stadium: v } }); qc.invalidateQueries({ queryKey: ["thread", threadId] }); qc.invalidateQueries({ queryKey: ["threads"] }); }}
                />
                <LanguageSelect
                  value={thread.language as LanguageId}
                  onChange={async (v) => { await updateFn({ data: { id: threadId, language: v } }); qc.invalidateQueries({ queryKey: ["thread", threadId] }); qc.invalidateQueries({ queryKey: ["threads"] }); }}
                />
              </>
            )}
            {thread && <SessionReportButton threadId={threadId} />}
            <Button size="icon" variant="ghost" aria-label="Sign out" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        {/* Body: chat + right rail */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-0 flex-col">
            {thread ? (
              <ChatPane
                key={threadId}
                threadId={threadId}
                initialMessages={initialMessages}
                role={thread.role as RoleId}
                stadium={thread.stadium ?? "MetLife"}
                language={thread.language as LanguageId}
                onPersist={async (msg) => {
                  try {
                    await saveMsgFn({ data: { thread_id: threadId, role: msg.role as any, parts: msg.parts as any } });
                    qc.invalidateQueries({ queryKey: ["threads"] });
                  } catch (e) { console.error("persist", e); }
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 flex-col border-l border-border bg-surface/40 lg:flex">
            <Tabs defaultValue="telemetry" className="flex flex-1 flex-col">
              <TabsList className="mx-3 mt-3 grid grid-cols-2">
                <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
                <TabsTrigger value="observe">Observability</TabsTrigger>
              </TabsList>
              <TabsContent value="telemetry" className="flex-1 overflow-auto p-4">
                <TelemetryPanel stadium={thread?.stadium ?? "MetLife"} />
              </TabsContent>
              <TabsContent value="observe" className="flex-1 overflow-auto p-4">
                <ObservabilityPanel />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */

function SidebarInner({
  threads, activeId, onCreate, onDelete, onToggleFav,
}: {
  threads: ThreadRow[];
  activeId: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onToggleFav: (id: string, favorite: boolean) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <img src={mark} alt="" width={28} height={28} className="rounded-md" />
        <div className="flex-1">
          <div className="text-sm font-bold">StadSpear</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Control tower</div>
        </div>
      </div>
      <div className="p-3">
        <Button className="w-full" onClick={onCreate}><Plus className="mr-1 size-4" /> New conversation</Button>
      </div>
      <ScrollArea className="flex-1">
        <ul className="space-y-1 px-2 pb-4">
          {threads.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No threads yet.</li>}
          {threads.map((t) => (
            <li key={t.id} className={"group flex items-center gap-1 rounded-md px-2 py-1 " + (t.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}>
              <Link to="/hub/$threadId" params={{ threadId: t.id }} className="min-w-0 flex-1 py-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{t.title}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded bg-primary/10 px-1 py-px text-primary">{t.role}</span>
                  {t.stadium && <span>· {t.stadium}</span>}
                  <span>· {t.language}</span>
                </div>
              </Link>
              <button
                onClick={() => onToggleFav(t.id, !t.favorite)}
                aria-label={t.favorite ? "Unfavorite" : "Favorite"}
                className="rounded p-1 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
              >
                <Star className={"size-3.5 " + (t.favorite ? "fill-primary text-primary opacity-100" : "")} />
              </button>
              <button
                onClick={() => { if (confirm("Delete this thread?")) onDelete(t.id); }}
                aria-label="Delete thread"
                className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="border-t border-sidebar-border p-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1"><Shield className="size-3" /> RLS on. Threads scoped to your account.</div>
      </div>
    </div>
  );
}

/* ---------------- Chat pane ---------------- */

function ChatPane({
  threadId, initialMessages, role, stadium, language, onPersist,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  role: RoleId; stadium: string; language: LanguageId;
  onPersist: (msg: UIMessage) => Promise<void>;
}) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    fetch: async (input, init) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    body: () => ({ threadId, role, stadium, language }),
  }), [threadId, role, stadium, language]);

  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistedIds = useRef(new Set<string>(initialMessages.map(m => m.id)));

  useEffect(() => { textareaRef.current?.focus(); }, [threadId]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (persistedIds.current.has(last.id)) return;
    persistedIds.current.add(last.id);
    onPersist(last);
  }, [status, messages, onPersist]);

  async function submit() {
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    setInput("");
    const userMsg: UIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
    persistedIds.current.add(userMsg.id);
    await onPersist(userMsg);
    await sendMessage({ text });
  }

  useEffect(() => { if (error) toast.error(error.message || "AI stream error"); }, [error]);

  const isLoading = status === "submitted" || status === "streaming";
  const suggestions = ROLE_SUGGESTIONS[role];

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div
          className="mx-auto max-w-3xl space-y-6"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-label="StadSpear concierge conversation"
        >
          {messages.length === 0 && (
            <EmptyState role={role} stadium={stadium} suggestions={suggestions} onPick={(s) => setInput(s)} />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} threadId={threadId} />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> StadSpear is thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-surface/60 p-3 sm:p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={`Ask about ${stadium}… (Enter to send, Shift+Enter for newline)`}
            className="min-h-[52px] resize-none bg-background"
            aria-label="Message the AI concierge"
          />
          {isLoading ? (
            <Button type="button" variant="outline" onClick={() => stop()}>Stop</Button>
          ) : (
            <Button type="submit" aria-label="Send message" disabled={!input.trim()}><Send className="size-4" /></Button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground">
          Answers can be imperfect. Verify safety-critical actions with venue staff.
        </p>
      </div>
    </>
  );
}

const ROLE_SUGGESTIONS: Record<RoleId, string[]> = {
  fan: [
    "Which gate has the shortest wait right now?",
    "Walk me from Section 112 to the nearest ADA restroom.",
    "How do I get back to downtown after the match?",
    "¿Dónde está la tienda oficial?",
  ],
  volunteer: [
    "A guest in a wheelchair needs an escort from Gate B to Section 210 — what's the protocol?",
    "Give me my pre-shift briefing for tonight.",
    "What do I say if a fan reports a lost child?",
  ],
  ops: [
    "Which concourses are trending hot right now?",
    "Give me a 60-second situational report.",
    "Estimated egress time for the north stands after full-time?",
  ],
};

function EmptyState({ role, stadium, suggestions, onPick }: { role: RoleId; stadium: string; suggestions: string[]; onPick: (s: string) => void }) {
  const roleMeta = ROLES.find(r => r.id === role)!;
  return (
    <div className="mt-8 text-center">
      <div className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">Welcome to the tower, {roleMeta.label.toLowerCase()}.</h2>
      <p className="mt-1 text-sm text-muted-foreground">Live context: <span className="text-foreground">{stadium}</span>. Ask anything — I'll pull telemetry and route on demand.</p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-surface p-3 text-left text-sm text-foreground transition hover:border-primary/50 hover:bg-surface/80"
          >
            {s} <ChevronRight className="ml-1 inline size-3 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, threadId }: { message: UIMessage; threadId: string }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const feedbackFn = useServerFn(submitFeedback);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  const textParts = message.parts.filter((p: any) => p.type === "text");
  const toolParts = message.parts.filter((p: any) => typeof p.type === "string" && p.type.startsWith("tool-"));

  return (
    <div className={"flex gap-3 " + (isUser ? "justify-end" : "")}>
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary" aria-hidden>
          <Sparkles className="size-4" />
        </div>
      )}
      <div className={"max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm " + (isUser ? "bg-primary text-primary-foreground" : "bg-surface text-surface-foreground")}>
        {toolParts.map((p: any, i) => <ToolPill key={i} part={p} />)}
        {textParts.map((p: any, i) => (
          <div key={i} className="whitespace-pre-wrap leading-relaxed">{p.text}</div>
        ))}
        {isAssistant && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <button
              disabled={!!voted}
              onClick={async () => { setVoted("up"); try { await feedbackFn({ data: { thread_id: threadId, message_id: message.id, rating: "up" } }); toast.success("Thanks!"); } catch {} }}
              className={"rounded p-1 hover:bg-background " + (voted === "up" ? "text-primary" : "")}
              aria-label="Helpful"
            >
              <ThumbsUp className="size-3" />
            </button>
            <button
              disabled={!!voted}
              onClick={async () => { setVoted("down"); try { await feedbackFn({ data: { thread_id: threadId, message_id: message.id, rating: "down" } }); toast.success("Feedback recorded."); } catch {} }}
              className={"rounded p-1 hover:bg-background " + (voted === "down" ? "text-destructive" : "")}
              aria-label="Not helpful"
            >
              <ThumbsDown className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolPill({ part }: { part: any }) {
  const name = String(part.type).replace(/^tool-/, "");
  const state = part.state ?? "";
  const degraded = part.output && (part.output.status === "degraded" || part.output.status === "unavailable" || part.output.degraded);
  const label = state.includes("call") || state === "input-streaming" || state === "input-available"
    ? `Calling ${name}…`
    : degraded ? `${name} · fallback used` : `${name} · ok`;
  return (
    <div className={"mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] " + (degraded ? "border-warn/40 bg-warn/10 text-warn" : "border-primary/30 bg-primary/10 text-primary")}>
      <Activity className="size-3" /> {label}
    </div>
  );
}

/* ---------------- Right rail ---------------- */

function TelemetryPanel({ stadium }: { stadium: string }) {
  const fn = useServerFn(getTelemetry);
  const tickFn = useServerFn(tickTelemetry);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["telemetry", stadium],
    queryFn: () => fn({ data: { stadium } }),
    refetchInterval: 30_000,
  });

  // Realtime: refetch when telemetry_cache rows for this stadium change.
  useEffect(() => {
    const channel = supabase
      .channel(`telemetry:${stadium}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemetry_cache", filter: `stadium=eq.${stadium}` },
        () => qc.invalidateQueries({ queryKey: ["telemetry", stadium] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [stadium, qc]);

  // Simulated live drift: tick the server every 5s so Realtime subscribers see
  // fresh values. Pauses when the tab is hidden to prevent server starvation
  // under high fan-density traffic. Realtime WebSocket subscription above is
  // the primary push channel; this tick only drives the demo simulator.
  const [streaming, setStreaming] = useState(true);
  useEffect(() => {
    if (!streaming) return;
    let cancelled = false;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      tickFn({ data: { stadium } }).catch(() => {});
    };
    tick();
    const id = setInterval(() => { if (!cancelled) tick(); }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stadium, streaming, tickFn]);


  const metrics = q.data?.metrics ?? [];
  const fetchedAt = q.data?.fetched_at;

  const iconFor: Record<string, any> = {
    gate_wait: Users, concourse_density: Radio, transit_eta: Bus, ada_restrooms: Accessibility, eco_points: Leaf,
  };
  const labelFor: Record<string, string> = {
    gate_wait: "Gate wait", concourse_density: "Concourse density", transit_eta: "Next transit",
    ada_restrooms: "ADA restrooms", eco_points: "Sustainability score",
  };

  const alerts = metrics
    .map((m: any) => ({ metric: m.metric, ...evaluateMetric(m.metric, m.value) }))
    .filter((a: any) => a.severity !== "ok") as Array<{ metric: string; severity: Severity; note?: string }>;
  const critical = alerts.filter(a => a.severity === "critical").length;
  const warn = alerts.filter(a => a.severity === "warn").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live telemetry</div>
          <div className="text-sm font-medium">{stadium}</div>
        </div>
        <button
          onClick={() => setStreaming(s => !s)}
          aria-label={streaming ? "Pause live stream" : "Resume live stream"}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <span className={"size-1.5 rounded-full " + (streaming ? "bg-primary pulse-dot" : "bg-muted-foreground")} aria-hidden />
          {streaming ? "Streaming" : "Paused"}
        </button>
      </div>

      {(critical > 0 || warn > 0) && (
        <div className={"flex items-start gap-2 rounded-md border p-2 text-xs " + (critical > 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warn/40 bg-warn/10 text-warn")}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <div className="font-semibold">
              {critical > 0 ? `${critical} critical` : ""}{critical > 0 && warn > 0 ? " · " : ""}{warn > 0 ? `${warn} warning` : ""}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {alerts.slice(0, 3).map(a => <li key={a.metric}>{a.note ?? a.metric}</li>)}
            </ul>
          </div>
        </div>
      )}

      {q.data?.degraded && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          Sensors unavailable — showing best-effort defaults.
        </div>
      )}
      <div className="grid gap-2">
        {metrics.length === 0 && !q.isLoading && (
          <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">No telemetry yet.</div>
        )}
        {metrics.map((m: any) => {
          const Icon = iconFor[m.metric] ?? Radio;
          const { severity, note } = evaluateMetric(m.metric, m.value);
          const toneBorder =
            severity === "critical" ? "border-destructive/50" :
            severity === "warn" ? "border-warn/50" : "border-border";
          const toneDot =
            severity === "critical" ? "bg-destructive" :
            severity === "warn" ? "bg-warn" : "bg-primary";
          return (
            <Card key={m.metric} className={"bg-surface p-3 transition " + toneBorder}>
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-primary" />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{labelFor[m.metric] ?? m.metric}</div>
                <span className={"ml-auto size-1.5 rounded-full " + toneDot} aria-label={severity} />
              </div>
              <div className="mt-1 text-sm font-medium tabular-nums">{formatMetric(m.value)}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>as of {new Date(m.generated_at).toLocaleTimeString()}</span>
                {severity !== "ok" && note && <span className={severity === "critical" ? "text-destructive" : "text-warn"}>{note}</span>}
              </div>
            </Card>
          );
        })}
      </div>
      {fetchedAt && (
        <p className="text-[10px] text-muted-foreground">Live via Realtime · thresholds evaluated per metric.</p>
      )}
    </div>
  );
}

function SessionReportButton({ threadId }: { threadId: string }) {
  const reportFn = useServerFn(getSessionReport);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await reportFn({ data: { threadId } });
      const md = renderReportMarkdown(r);
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (r.thread.title || "session").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 40);
      a.href = url;
      a.download = `stadspear-${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Session report downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Report failed");
    } finally { setBusy(false); }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy} aria-label="Download session report">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
      <span className="ml-1 hidden sm:inline">Report</span>
    </Button>
  );
}

function renderReportMarkdown(r: any): string {
  const t = r.thread;
  const lines: string[] = [];
  lines.push(`# StadSpear session report`);
  lines.push(``);
  lines.push(`- **Thread:** ${t.title}`);
  lines.push(`- **Role:** ${t.role}  ·  **Stadium:** ${t.stadium ?? "—"}  ·  **Language:** ${t.language}`);
  lines.push(`- **Created:** ${new Date(t.created_at).toLocaleString()}`);
  lines.push(`- **Generated:** ${new Date(r.generatedAt).toLocaleString()}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`- Messages: **${r.counts.messages}** (user ${r.counts.userMessages} · assistant ${r.counts.assistantMessages})`);
  lines.push(`- Tool calls: **${r.counts.tools}**  ·  AI runs: **${r.counts.runs}**  ·  Total tokens: **${r.totalTokens}**  ·  Avg stream: **${r.avgStreamMs} ms**`);
  lines.push(`- Feedback: 👍 ${r.counts.thumbsUp}  ·  👎 ${r.counts.thumbsDown}`);
  lines.push(``);
  if (Object.keys(r.toolBreakdown).length) {
    lines.push(`## Tool breakdown`);
    for (const [name, b] of Object.entries<any>(r.toolBreakdown)) {
      lines.push(`- \`${name}\` — ok ${b.ok} · degraded ${b.degraded} · unavailable ${b.unavailable} · error ${b.error}`);
    }
    lines.push(``);
  }
  if (r.alerts?.length) {
    lines.push(`## Active alerts (${t.stadium ?? ""})`);
    for (const a of r.alerts) lines.push(`- **${a.severity.toUpperCase()}** — ${a.note ?? a.metric}`);
    lines.push(``);
  }
  if (r.telemetry?.length) {
    lines.push(`## Telemetry snapshot`);
    for (const m of r.telemetry) lines.push(`- \`${m.metric}\`: \`${JSON.stringify(m.value)}\` @ ${new Date(m.generated_at).toLocaleTimeString()}`);
    lines.push(``);
  }
  if (r.messages?.length) {
    lines.push(`## Transcript`);
    for (const m of r.messages) {
      lines.push(`**${m.role}** _(${new Date(m.created_at).toLocaleTimeString()})_`);
      lines.push(``);
      lines.push(m.text || "_(no text)_");
      lines.push(``);
    }
  }
  return lines.join("\n");
}

function formatMetric(v: any): string {
  if (!v || typeof v !== "object") return String(v);
  if ("minutes" in v) return `${v.minutes} min${v.trend ? ` · ${v.trend}` : ""}`;
  if ("level" in v) return `${v.level}${v.percent != null ? ` · ${v.percent}%` : ""}`;
  if ("nextTrain" in v) return `${v.nextTrain} · ${v.line}`;
  if ("available" in v) return `${v.available} open · nearest ${v.closest}`;
  if ("score" in v) return `${v.score}/100 · ${v.note}`;
  return JSON.stringify(v);
}

function ObservabilityPanel() {
  const fn = useServerFn(getObservabilitySummary);
  const q = useQuery({ queryKey: ["observability"], queryFn: () => fn(), refetchInterval: 20_000 });
  const s = q.data?.summary;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Observability (yours)</div>
        <Link to="/dashboard" className="text-[11px] text-primary hover:underline">Live dashboard →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Total tokens" value={s?.totalTokens ?? 0} />
        <MiniStat label="Avg stream" value={`${s?.avgStreamMs ?? 0} ms`} />
        <MiniStat label="Tool calls" value={s?.toolCalls ?? 0} />
        <MiniStat label="Tool failures" value={s?.toolFail ?? 0} tone={s && s.toolFail > 0 ? "warn" : "ok"} />
        <MiniStat label="👍" value={s?.thumbsUp ?? 0} />
        <MiniStat label="👎" value={s?.thumbsDown ?? 0} />
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Recent tool events</div>
        <ul className="space-y-1">
          {(q.data?.tools ?? []).slice(0, 5).map((t: any) => (
            <li key={t.id} className="flex items-center justify-between rounded border border-border bg-surface px-2 py-1 text-[11px]">
              <span className="truncate">{t.tool_name}</span>
              <span className={t.status === "ok" ? "text-primary" : "text-warn"}>{t.status}{t.latency_ms != null ? ` · ${t.latency_ms}ms` : ""}</span>
            </li>
          ))}
          {(q.data?.tools ?? []).length === 0 && <li className="text-[11px] text-muted-foreground">No tool activity yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "ok" }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className={"rounded-md border p-2 " + (tone === "warn" ? "border-warn/40 bg-warn/10" : "border-border bg-surface")}>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/* ---------------- Selects ---------------- */

function RoleSelect({ value, onChange }: { value: RoleId; onChange: (v: RoleId) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RoleId)}>
      <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Role"><SelectValue /></SelectTrigger>
      <SelectContent>
        {ROLES.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
function StadiumSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Stadium"><SelectValue /></SelectTrigger>
      <SelectContent>
        {STADIUMS.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
function LanguageSelect({ value, onChange }: { value: LanguageId; onChange: (v: LanguageId) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LanguageId)}>
      <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Language"><SelectValue /></SelectTrigger>
      <SelectContent>
        {LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
