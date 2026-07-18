// Browser-only Supabase client that reads config at RUNTIME.
//
// The auto-generated `client.ts` reads `process.env.SUPABASE_URL` as a
// fallback, which Vite statically replaces with `{}.SUPABASE_URL` in the
// client bundle — so on hosts where only `VITE_*` names are injected at
// build time, the fallback is dead. Sign-in silently fails on hydration.
//
// This module deliberately avoids bare `process.env.*` so Vite leaves the
// runtime reads alone, and instead pulls values off `window.process.env`
// (seeded by the inline script in `src/routes/__root.tsx`).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type WindowWithProcess = Window & {
  process?: { env?: Record<string, string | undefined> };
};

function readRuntime(name: string): string {
  if (typeof window === "undefined") return "";
  const env = (window as WindowWithProcess).process?.env;
  return env?.[name] ?? "";
}

function resolveUrl(): string {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    readRuntime("SUPABASE_URL") ||
    readRuntime("VITE_SUPABASE_URL") ||
    ""
  );
}

function resolveKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    readRuntime("SUPABASE_PUBLISHABLE_KEY") ||
    readRuntime("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    ""
  );
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

let _client: SupabaseClient<Database> | undefined;

export function getBrowserSupabase(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = resolveUrl();
  const key = resolveKey();
  if (!url || !key) {
    throw new Error(
      "Supabase runtime config unavailable. Reload the page; if this persists, contact support.",
    );
  }
  _client = createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _client;
}

// Drop-in replacement for the auto-generated `supabase` export. Same lazy
// Proxy pattern — nothing is constructed until first property access, so
// SSR-time imports don't touch `window`.
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_t, prop, receiver) {
    return Reflect.get(getBrowserSupabase(), prop, receiver);
  },
});

