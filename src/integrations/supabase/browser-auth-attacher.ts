import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./browser-client";

// Runtime-aware bearer token attacher for server functions.
// The generated attacher imports the build-time Supabase client, which can be
// missing config in the published/preview browser bundle. This one uses the
// same runtime-aware client as the auth and hub routes.
export const attachBrowserSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);