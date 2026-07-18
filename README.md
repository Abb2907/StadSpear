# StadSpear — GenAI Ops Concierge for FIFA World Cup 2026

> An all-in-one, GenAI-powered operational hub that helps fans, volunteers, and venue staff navigate FIFA World Cup 2026 stadiums with real-time telemetry, multilingual concierge chat, accessibility-first wayfinding, transit and sustainability guidance — with graceful degradation when any live signal drops.

**Live site:** https://stadspear.lovable.app

---

## The Problem

FIFA World Cup 2026 will bring **millions of visitors across 16 host stadiums in 3 countries**. Every match day, stadium operations must answer thousands of simultaneous questions in dozens of languages:

- *"Which gate has the shortest wait right now?"*
- *"Where's the nearest ADA-accessible restroom from Section 218?"*
- *"When does the next shuttle leave for downtown?"*
- *"How do I recycle this cup?"*

Traditional signage, static apps, and human staff can't scale to that volume. When live telemetry, routing, or transit APIs go down mid-match, most apps just show an error — leaving fans stranded and staff overwhelmed.

## How StadSpear Solves It

StadSpear is a **GenAI-first operational control tower** with four surfaces working in concert:

1. **Multilingual AI Concierge** — A streaming chat assistant powered by tool-calling. Ask anything in any language; it invokes purpose-built tools (`get_stadium_telemetry`, `get_wayfinding_route`, `get_transit_options`, `get_sustainability_tip`) to ground its answer in live data.
2. **Live Ops Telemetry Tiles** — Crowd density, gate waits, transit ETA, ADA restroom availability, sustainability score. Cached read-through with timestamps so stale data degrades gracefully instead of erroring.
3. **Real-time Streaming + Alert Thresholds** — Supabase Realtime pushes telemetry updates every 5 seconds. Metrics are evaluated against thresholds (`gate_wait`, `concourse_density`, `transit_eta`, `ada_restrooms`, `eco_points`) and surfaced as `ok` / `warn` / `critical` badges with actionable notes.
4. **Observability Dashboard + Drilldown** — Charts real-time tool latency (avg + p95), fallback rates, and stream duration. Click any point to drill into the underlying tool executions grouped by thread, with search and status filters.

### Graceful degradation, always

Every chat tool returns a `status`: `ok`, `degraded`, or `unavailable` — so when live routing or telemetry fails, the assistant says *"Live routing is temporarily unavailable — here's a best-effort walking route"* instead of crashing.

### Session report export

Any stadium thread can be exported as a Markdown session report containing messages, tool events, AI gateway runs, feedback, telemetry snapshot, and active alerts.

### Agent-ready via MCP

StadSpear exposes its tools as an **OAuth 2.1-protected MCP server** at `/mcp` so external assistants (ChatGPT, Claude, Codex) can act as the signed-in user under Row-Level Security.

---

## Architecture

```text
                             ┌───────────────────────────────────────┐
                             │         Fans · Volunteers · Ops       │
                             └──────────────────┬────────────────────┘
                                                │
                    ┌───────────────────────────┴───────────────────────────┐
                    │                                                       │
       ┌────────────▼──────────────┐                        ┌───────────────▼──────────────┐
       │   TanStack Start (React)  │                        │   External AI Clients      │
       │   /hub  /dashboard        │◀──streaming SSE────┐   │   ChatGPT · Claude · Codex │
       │   /dashboard/events       │                    │   └───────────────┬──────────────┘
       │   /guides/...             │                    │                   │
       └────────────┬──────────────┘                    │      OAuth 2.1 + Bearer JWT
                    │                                    │                   │
      TanStack Query│ createServerFn (RPC)               │        ┌──────────▼──────────┐
                    │                                    │        │  /mcp  (MCP Server) │
       ┌────────────▼──────────────┐                     │        │  6 tools · RLS      │
       │   Server Functions +      │                     │        └──────────┬──────────┘
       │   /api/chat (AI SDK)      │─── streamText ──────┘                   │
       │   Tools: telemetry,       │                                         │
       │   wayfinding, transit,    │                                         │
       │   sustainability          │                                         │
       └─────┬──────────────┬──────┘                                         │
             │              │                                                │
   ┌─────────▼─────────┐   ┌▼──────────────────────┐               ┌─────────▼─────────┐
   │ Lovable AI Gateway│   │  Lovable Cloud (PG)   │◀──────────────┤  Supabase Auth    │
   │  Gemini 2.5 Flash │   │  threads · messages   │   RLS + JWT   │  Google + Email   │
   └───────────────────┘   │  telemetry_cache      │               └───────────────────┘
                           │  tool_events          │
                           │  ai_gateway_runs      │
                           │  feedback             │
                           └───────────────────────┘
```

**Data flow highlights**

- **Chat**: Browser `useChat` → `POST /api/chat` (AI SDK `streamText`) → tool loop → tokens streamed back as UI-message parts. Every tool call is instrumented into `tool_events` with latency + status.
- **Fallbacks**: `chat-tools.ts` executors return `{ status, data, note }`. Telemetry tile does a read-through against `telemetry_cache` and shows the timestamp of last-known-good.
- **Real-time**: `TelemetryPanel` subscribes to Supabase Realtime on `telemetry_cache` and jitters values server-side via `tickTelemetry` every 5s.
- **Alerts**: `evaluateMetric` thresholds classify each metric as `ok`/`warn`/`critical`; the hub shows a summary alert banner and per-tile severity badges.
- **Session report**: `getSessionReport` aggregates messages, tool events, gateway runs, feedback, telemetry, and alerts into a downloadable Markdown report.
- **Observability**: `dashboard.functions.ts` aggregates `tool_events` into time-bucketed p95 / fallback / stream metrics; click a chart point → `/dashboard/events?from=…&to=…&stadium=…` opens the raw log drilldown.

---

## Tech Stack

| Layer | Tech |
| --- | --- |
| **Framework** | TanStack Start v1 (React 19, SSR, file-based routing) |
| **Build / Runtime** | Vite 7, Cloudflare Workers (edge SSR) |
| **Styling** | Tailwind CSS v4, semantic design tokens ("Operational Control Tower" dark theme) |
| **UI Kit** | shadcn/ui, Radix primitives, lucide-react, Recharts |
| **AI SDK** | Vercel AI SDK (`ai`, `@ai-sdk/react`) with `streamText` + tools + `stopWhen(stepCountIs)` |
| **Model** | Google Gemini 2.5 Flash via **Lovable AI Gateway** (`ai.gateway.lovable.dev`) |
| **Data Fetching** | TanStack Query (loader `ensureQueryData` + `useSuspenseQuery`) |
| **Backend** | TanStack `createServerFn` (RPC) + `src/routes/api/*` server routes |
| **Database & Auth** | Lovable Cloud (Supabase Postgres) with Row-Level Security, Google OAuth + Email |
| **Realtime** | Supabase Realtime on `telemetry_cache` |
| **Agent Protocol** | `@lovable.dev/mcp-js` — OAuth 2.1 resource server at `/mcp` |
| **Testing** | Vitest — 36 unit tests + 12 latency benchmarks |
| **Typecheck** | `tsgo --noEmit` (strict TypeScript) |

---

## Evaluation-Criteria Coverage

| Criterion | Where it lives |
| --- | --- |
| **Problem-statement alignment** | Every FIFA-2026 pillar (navigation, crowd, accessibility, transit, sustainability, multilingual, ops intelligence, real-time decision support) maps to a first-class feature. |
| **Frontend** | TanStack routes for landing, auth, hub, dashboard, drilldown, and incident-management guide; WCAG-AA color pairs; ARIA + live regions on AI streams. |
| **Backend** | Server functions with Zod input validators; RLS on every table; instrumented tool wrapper; realtime telemetry tick. |
| **Security** | Supabase RLS scoped by `auth.uid()`, Zod validation, no secrets in the client, MCP tokens verified against Supabase issuer, GRANTs limited to `authenticated` + `service_role`. |
| **Accessibility** | Semantic HTML, keyboard-first controls, live-region streaming updates, ADA restroom telemetry surfaced in the tool. |
| **Code Quality** | Strict TS, small focused components, service-layer extraction (`chat-tools.ts`, `thread-service.ts`) for testability. |
| **Efficiency** | Streamed responses, TanStack Query cache, telemetry read-through cache, parallel tool fan-out, realtime delta updates. |
| **Testing** | 36 Vitest unit tests covering fallbacks + service logic; 12 benchmarks (p95 latency under simulated slowdowns). |
| **Observability** | `tool_events`, `ai_gateway_runs`, `feedback` tables + a live charting dashboard + drilldown with filters + session report export. |

---

## Local Development

```bash
bun install
bun run dev          # start Vite dev server
bun run test         # 36 unit tests
bun run test tests/perf.bench.test.ts   # 12 latency benchmarks
bun run build        # production build / typecheck
```

Environment (auto-provisioned by Lovable Cloud): `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## MCP (Agent Integrations)

Six tools live at `/mcp`, protected by Supabase OAuth 2.1:

- `get_stadium_telemetry` · `get_wayfinding_route` · `get_transit_options` · `get_sustainability_tip`
- `list_my_threads` · `get_thread_messages` — RLS-scoped to the signed-in user.

Point ChatGPT / Claude / Codex at the published `/mcp` URL and complete the branded consent flow at `/.lovable/oauth/consent`.

---

## License

Built for the FIFA World Cup 2026 GenAI hackathon. All content and diagrams © the StadSpear team.
