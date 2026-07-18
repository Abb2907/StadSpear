import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_threads",
  title: "List my StadSpear threads",
  description:
    "List the signed-in user's StadSpear concierge conversations, newest first. Returns thread id, title, stadium, match, role, language, favorite flag, and last viewed timestamp.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .describe("Max threads to return (1-100). Defaults to 20 if omitted or out of range.")
      .optional(),
    favoriteOnly: z
      .boolean()
      .describe("If true, only return threads the user has marked as favorite.")
      .optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, favoriteOnly }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const safeLimit = Math.max(1, Math.min(100, limit ?? 20));
    let q = supabaseForUser(ctx)
      .from("threads")
      .select("id, title, stadium, match, role, language, favorite, last_viewed_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(safeLimit);
    if (favoriteOnly) q = q.eq("favorite", true);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { threads: data ?? [] },
    };
  },
});
