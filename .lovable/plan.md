
## Product

StadSpear — a GenAI-powered all-in-one hub for FIFA World Cup 2026 stadium operations. A single signed-in surface with a role switcher (Fan / Volunteer / Ops) that reveals role-appropriate tools over shared live data. Design direction: "Operational Control Tower" (dark match header, split hero, quick-support tiles).

## Problem-statement alignment

| Pillar | Delivery |
| --- | --- |
| Navigation | AI wayfinding tool + heat-map surface + quick-actions |
| Crowd management | Live tiles (gate wait, concourse density) + AI insight rail |
| Accessibility | `accessible` flag on wayfinding + step-free quick action + AA contrast |
| Transportation | Transit tile + AI transport advisor |
| Sustainability | Eco Points tile + AI sustainability guidance |
| Multilingual | Model auto-detects language; multilingual prompt chips; language stored per thread |
| Operational intelligence | Ops-role prompt + `generateInsights` structured output |
| Real-time decision support | Streaming chat with live tools reading mock telemetry |

## Architecture

```text
Browser ──► TanStack Start server (Cloudflare Worker)
              ├─ /api/chat (streamText → toUIMessageStreamResponse)
              ├─ createServerFn (threads, insights, telemetry, feedback)
              └─ requireSupabaseAuth
                    ▼
              Lovable AI Gateway  (google/gemini-3.5-flash)
                    ▼
              Lovable Cloud: threads, messages, telemetry_cache,
                              tool_events, feedback  (RLS on auth.uid())
```

## Thread metadata (updated per user feedback)

The `threads` table carries per-conversation context so the model, insight rail, and UI can adapt without re-asking:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | uuid pk | thread id |
| `user_id` | uuid fk auth.users | RLS scope |
| `title` | text | auto-titled from first turn |
| `role` | text check (`fan`/`volunteer`/`ops`) | drives system prompt + quick actions |
| `stadium` | text | e.g. `MetLife`, `SoFi` — biases tools + insights |
| `match` | text | e.g. `USA vs MEX — Jun 12` — added to system prompt |
| `language` | text (BCP-47) | preferred reply language; auto-detected but overridable |
| `favorite` | boolean default false | pinned in thread list, sorted first |
| `last_viewed_at` | timestamptz | drives recency ordering, "Recent" section |
| `created_at` / `updated_at` | timestamptz | standard |

- Thread list UI: Favorites section (star toggle) → recent (by `last_viewed_at`) → older.
- Selecting a thread updates `last_viewed_at` server-side.
- A small "Match context" chip in the header shows `role · stadium · match · language`, click to edit.
- The chat route passes this metadata into the system prompt so replies are grounded in the right stadium/match/language.

## Fallback behavior (updated per user feedback)

Every tool and telemetry read has an explicit degraded path — the user always gets a useful answer, never a raw error.

- **Tool wrapper** — each AI SDK tool's `execute` is wrapped in a try/catch that returns a structured `{ status: "ok" | "degraded" | "unavailable", data, note, source, generatedAt }` shape. The model is instructed (in the system prompt) to surface the `note` verbatim when `status !== "ok"`.
- **Wayfinding fails** → returns `{ status: "degraded", data: <static best-effort walking route from a bundled floor-plan graph>, note: "Live routing is temporarily unavailable. Here's a best-effort walking route." }`. The model relays this note and the static route.
- **Telemetry unavailable (live tiles / getStadiumStatus)** →
  1. Last successful snapshot is written to `telemetry_cache` (per stadium, per metric) with a timestamp.
  2. On fetch failure, the server fn returns cached values plus `generatedAt` and a `stale: true` flag.
  3. UI renders the cached numbers with a small "Updated 4 min ago · reconnecting" chip and an amber (not red) status dot; no empty state.
  4. If no cache exists yet, the tile shows a neutral "Data pending" placeholder — never "Error".
- **Insight rail schema violation** — `NoObjectGeneratedError.isInstance(error)` guard parses `error.text` into a best-effort list; if that also fails, we render the last successful insight batch with a "Showing previous insights" chip.
- **Chat route errors** — 429 → toast "Rate limited, retrying in Xs" + auto-retry once; 402 → toast "AI credits exhausted" with a link; network → composer stays enabled, last user message re-editable.
- **Auth expiry mid-stream** — surface a "Session expired, sign in again" inline card in the chat, not a blank page.

The core invariant: **the UI never shows a raw error state where a degraded but useful state is possible.**

## Observability (updated per user feedback)

Lightweight, self-hosted logging — enough to diagnose AI behavior without extra services.

- **`tool_events` table** (RLS: user reads own, service_role writes):
  - `id`, `user_id`, `thread_id`, `message_id`, `tool_name`, `status` (`ok`/`degraded`/`error`), `latency_ms`, `input_hash`, `error_type`, `error_message`, `created_at`.
  - Written by the tool wrapper on every invocation.
- **`ai_gateway_runs` table**:
  - `id`, `user_id`, `thread_id`, `model`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `stream_duration_ms`, `finish_reason`, `status`, `created_at`.
  - Written in `onFinish` of `toUIMessageStreamResponse` using `usage` and timing captured around `streamText`.
- **`feedback` table**:
  - `id`, `user_id`, `thread_id`, `message_id`, `rating` (`up`/`down`), `reason` (nullable text), `created_at`.
  - Thumbs-up/down under each assistant message; optional freeform reason on thumbs-down. Server fn writes the row.
- **Correlation** — every chat request generates a `run_id` (attached to Gateway calls via `withLovableAiGatewayRunIdHeader`) and is written into `ai_gateway_runs`, `tool_events`, and `feedback` so a single conversation turn can be traced end-to-end. Also queryable via `ai_gateway_logs--list_ai_gateway_requests` by run_id.
- **Ops-only observability page** `/hub/observability` (gated by role):
  - Recent turns table: model, tokens in/out, stream duration, tool calls, status, feedback.
  - Tool health tiles: p50/p95 latency, error rate, degraded rate per tool over 24h — computed via SQL rollup views.
  - Feedback summary: 👍/👎 counts, latest negative reasons.
- **Console/server logs** — every tool wrapper and the chat route emit a single structured `console.log({ event, run_id, thread_id, tool, status, latency_ms })` line; readable via `stack_modern--server-function-logs`.

## Frontend

- TanStack Start + React 19 + Tailwind v4 + AI Elements.
- Design tokens (emerald primary, amber warn, blue info, red destructive, zinc surfaces) in `src/styles.css`; no hardcoded colors.
- Inter via `<link>` in `__root.tsx` head.
- Chat window: `conversation` / `message` / `prompt-input` / `shimmer` / `tool`. `MessageResponse` for markdown streaming. Textarea autofocus on mount/send/stream-end/thread-switch.
- Sample prompt chips (multilingual). StadSpear SVG mark for agent identity.
- Thread list: Favorites (star toggle) + Recent (by `last_viewed_at`) + delete/rename; each thread has a dedicated URL `/hub/$threadId`; chat window keyed by threadId.
- Match-context chip editor (role/stadium/match/language) opens a sheet.
- Live tiles render `stale` state with amber chip and "Updated N ago" timestamp.
- Feedback thumbs under each assistant message; reason input on thumbs-down.

## Backend

- **`/api/chat`** — streaming route. Reads `LOVABLE_API_KEY` inside handler. Injects thread metadata (role/stadium/match/language) into system prompt. Writes `ai_gateway_runs` in `onFinish`. Persists user + assistant `UIMessage` under the thread. Emits `run_id` header. Handles 429/402/network with typed error payloads.
- **AI Gateway helper** `src/lib/ai-gateway.server.ts` — canonical provider + `withLovableAiGatewayRunIdHeader`.
- **Model** `google/gemini-3.5-flash` (fast, multilingual, tool-capable).
- **Tools** (`src/lib/stadium-tools.ts`, Zod inputs, wrapped in fallback + logging):
  - `getStadiumStatus({ stadium })`
  - `getWayfindingRoute({ stadium, from, to, accessible })`
  - `getTransitOptions({ stadium })`
  - `getSustainabilityTips({ stadium })`
  - Wrapper returns the `{ status, data, note, source, generatedAt }` shape and inserts a `tool_events` row.
- **Insights** `src/lib/insights.functions.ts` — `Output.object` with a small, constraint-free schema; `NoObjectGeneratedError` guard falls back to `error.text` parse, then to last cached batch.
- **Telemetry cache** `src/lib/telemetry.functions.ts` — read-through cache: try live source → on error return latest `telemetry_cache` row with `stale: true`; on success upsert cache.
- **Threads** `src/lib/threads.functions.ts` — list/create/rename/delete/favorite/updateMetadata/touchLastViewed. All scoped by `context.userId`.
- **Feedback** `src/lib/feedback.functions.ts` — insert thumbs + reason.
- **Bearer attach** — append `attachSupabaseAuth` to `functionMiddleware` in `src/start.ts`.

## Migration (one file, in order)

- `threads` (columns above) + grants + RLS + policies scoped to `auth.uid()`.
- `messages` (uuid pk, thread_id fk, role, parts jsonb, created_at) + grants + RLS via join through threads + `(thread_id, created_at)` index.
- `telemetry_cache` (stadium, metric, value jsonb, generated_at) unique(stadium, metric); service_role writes; authenticated reads scoped to any stadium (public op data).
- `tool_events` — user_id, thread_id, tool_name, status, latency_ms, error fields; authenticated select own; service_role insert.
- `ai_gateway_runs` — user_id, thread_id, model, token counts, stream_duration_ms, finish_reason; same access model.
- `feedback` — user_id, thread_id, message_id, rating, reason; authenticated insert/select own.
- Rollup views for observability tiles (p50/p95 latency per tool, error rate, feedback totals).

## Auth

- Lovable Cloud email/password + Google (via `supabase--configure_social_auth`).
- Managed `_authenticated/route.tsx` gate.
- Sign-out hygiene: `cancelQueries` → `clear` → `signOut` → `navigate({ replace: true })`.

## Security

- RLS on every user-data table, scoped to `auth.uid()`.
- No service-role usage in v1 paths.
- Zod validation on every server fn input and chat body.
- No `dangerouslySetInnerHTML`; markdown via AI Elements.
- Input length caps client + server. No PII in logs (message content is not logged, only metadata: tool name, status, latency, tokens).
- Security scan run after schema; findings resolved or documented via `security--update_memory`.

## Accessibility

- WCAG AA token pairs; single `<main>` per route.
- `aria-label` on every icon-only button (star, delete, submit, role switcher).
- Live regions (`aria-live="polite"`) for insight rail and stale-tile chips.
- Tap targets ≥ 44×44 on mobile primaries.
- Keyboard-navigable role switcher, thread list, and match-context sheet.
- Heat-map image has descriptive `alt`.

## Code quality

- Strict TS; Zod-inferred types across server fns.
- Small components under `src/components/hub/`; server split between `.functions.ts` (client-safe) and `.server.ts` (server-only).
- TanStack Query `ensureQueryData` in loaders + `useSuspenseQuery` in components — no `useEffect` + fetch on initial render.
- Semantic tokens only; consistent naming; ESLint clean.
- Route error/notFound boundaries on every route with a loader; root has both.

## Efficiency

- Streaming responses; Gemini Flash tier.
- Insight rail cached (`staleTime` 60s).
- Telemetry cache serves last-known values instantly; live fetch happens in background.
- Per-thread message load with `(thread_id, created_at)` index.
- Provider built per-request to keep run-id closure correct.
- Small structured-output schemas; no `.min/.max` bounds.

## Testing / verification

- Full `build:dev` passes.
- Manual acceptance:
  1. Sign up → hub.
  2. English then Spanish messages → replies in the same language; thread `language` set.
  3. Star a thread → sorts under Favorites; reload preserves.
  4. Ask "step-free route to Section 112" → wayfinding tool call visible.
  5. Force wayfinding failure (temporary flag) → degraded route + "Live routing temporarily unavailable" note surfaces.
  6. Force telemetry failure → tile shows cached values + "Updated N ago" chip; no red error.
  7. Refresh insights; force schema break → fallback batch renders.
  8. Thumbs-down an assistant message with a reason → row appears on `/hub/observability`.
  9. Reload `/hub/<threadId>` → same thread + metadata + messages.
  10. Sign out → protected routes redirect; back-button doesn't restore.
- Automated: Vitest units for
  - `generateInsights` fallback path,
  - tool wrapper degraded/error shape,
  - telemetry read-through cache,
  - thread RLS scoping (mocked Supabase).
- Observability: after a full session, verify `ai_gateway_runs`, `tool_events`, `feedback` rows exist and cross-reference by `run_id`; verify Gateway logs align via `ai_gateway_logs--list_ai_gateway_requests`.
- Accessibility: manual pass + Playwright screenshot at 1440×900.
- Security: run `security--run_security_scan`; resolve or document findings.

## SEO / metadata

- `__root.tsx`: real title `StadSpear — FIFA 2026 Stadium Companion`, description, `og:*`, `twitter:card`.
- `/` (public landing) sets its own head + `og:image` (generated hero, absolute URL).
- Single `<h1>` per route; `public/llms.txt` lists `/` and `/auth` only.

## Files (new/changed)

```text
src/routes/index.tsx                          # landing (replace placeholder)
src/routes/auth.tsx                           # sign-in / sign-up
src/routes/_authenticated/route.tsx           # managed gate
src/routes/_authenticated/hub.tsx             # hub layout + role/match-context
src/routes/_authenticated/hub.$threadId.tsx   # active thread
src/routes/_authenticated/hub.observability.tsx  # ops-only telemetry
src/routes/api/chat.ts                        # streaming chat + run tracking
src/routes/__root.tsx                         # head, Inter link, auth listener
src/lib/ai-gateway.server.ts
src/lib/insights.functions.ts
src/lib/threads.functions.ts
src/lib/telemetry.functions.ts
src/lib/feedback.functions.ts
src/lib/stadium-tools.ts                      # tools + fallback + logging wrapper
src/components/hub/{MatchHeader,StadiumPulse,ConciergePanel,InsightRail,
                    RoleSwitcher,QuickSupport,ThreadList,MatchContextSheet,
                    StaleChip,FeedbackButtons}.tsx
src/components/hub/observability/{RunsTable,ToolHealth,FeedbackSummary}.tsx
src/assets/{heatmap.jpg,stadspear-mark.svg}
src/styles.css
public/{favicon.ico,llms.txt}
```

Single migration adds: `threads`, `messages`, `telemetry_cache`, `tool_events`, `ai_gateway_runs`, `feedback`, rollup views, grants, RLS, policies, indexes.

## Out of scope (v1)

- Real telemetry/transit integrations (adapter shape ready; mocked).
- Push notifications, PWA, offline mode.
- Payments, ticketing.
- Static-copy i18n (AI is multilingual; UI chrome stays English).
