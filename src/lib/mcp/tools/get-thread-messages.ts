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
  name: "get_thread_messages",
  title: "Get messages in a thread",
  description:
    "Return the messages of one of the signed-in user's StadSpear threads, oldest first. RLS enforces that only threads owned by the caller are readable.",
  inputSchema: {
    threadId: z.string().describe("UUID of the thread to read."),
    limit: z
      .number()
      .int()
      .describe("Max messages to return (1-200). Defaults to 50.")
      .optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ threadId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const safeLimit = Math.max(1, Math.min(200, limit ?? 50));
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, parts, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(safeLimit);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { threadId, messages: data ?? [] },
    };
  },
});
