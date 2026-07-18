## Fix deployed auth: bridge build-time vs run-time env

### Confirmed root cause (verified in deployed JS)
The published bundle compiles the Supabase client's env lookup to:
```
let url = {}.SUPABASE_URL
let key = {}.SUPABASE_PUBLISHABLE_KEY
```
Vite statically replaced `process.env.*` with `{}` at build. The runtime `window.process.env` shim I added in `__root.tsx` is present in HTML but the bundle never reads it, so the Supabase client throws `Missing Supabase environment variable(s)` at hydration and all sign-in buttons silently fail on `stadspear.lovable.app`.

`src/integrations/supabase/client.ts` is auto-generated and must not be edited.

### Fix strategy
Introduce a runtime-safe browser Supabase client and route the auth page through it, bypassing the broken static replacement in the generated client.

1. **New file `src/integrations/supabase/browser-client.ts`** (browser-only, not auto-generated)
   - Exposes `getBrowserSupabase()` which resolves URL + publishable key using this exact priority (so Vite cannot statically null it out):
     ```ts
     const url =
       import.meta.env.VITE_SUPABASE_URL ||
       (typeof window !== "undefined" && (window as any).process?.env?.SUPABASE_URL) ||
       (typeof window !== "undefined" && (window as any).process?.env?.VITE_SUPABASE_URL) ||
       "";
     ```
   - Same pattern for the publishable key.
   - Creates the client lazily and memoizes it. Includes the same `apikey`/`Authorization` fetch shim as the generated client so new-format `sb_publishable_` keys still work.
   - Never references bare `process.env.*` — always through the `window` accessor — so Vite leaves it alone.

2. **Route the auth page through it**
   - In `src/routes/auth.tsx` replace `import { supabase } from "@/integrations/supabase/client"` with `const supabase = getBrowserSupabase()` from the new module for `getSession`, `onAuthStateChange`, `signInWithPassword`, `signUp`.
   - Keep `lovable.auth.signInWithOAuth` as-is (it calls `supabase.auth.setSession` on the generated client, but that path is only reached in the popup case; if that path also crashes we swap in the browser client where needed).
   - Empty `next` already defaults to `/hub` — verify and keep.
   - Keep `redirect_uri` as `window.location.origin` (public route), not `/hub`.

3. **Keep the `__root.tsx` runtime script**
   - It seeds `window.process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` from the server env, which is exactly what the new client reads at runtime.

4. **Verify locally in a fresh session**
   - `/auth?next=` hydrates with no `Missing Supabase environment variable` pageerror.
   - Email/password sign-in performs a real auth request (not a silent no-op).
   - “New here? Create an account” toggles the form.
   - Google click navigates to `/~oauth/initiate?provider=google...`.

5. **Publish and re-verify on `stadspear.lovable.app`**
   - Fetch `/auth?next=` and the main JS chunk; confirm the auth path no longer resolves URL/key via `{}.SUPABASE_URL` and that the OAuth broker route fires from a real click.

### Non-goals
- No changes to `src/integrations/supabase/client.ts` (auto-generated).
- No changes to `vite.config.ts` `define` (the earlier `define` block was the original regression; leaving it removed).
- No changes to Supabase auth URL config or Google OAuth (already verified correct via `debug_oauth_server`).