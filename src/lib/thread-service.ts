/**
 * Pure service-layer functions for thread + message CRUD.
 * Take a Supabase-like client and userId, so they can be unit-tested with mocks.
 */

export interface ThreadClient {
  from: (table: string) => any;
}

export async function listThreadsFor(supabase: ThreadClient) {
  const { data, error } = await supabase
    .from("threads")
    .select("id, title, role, stadium, match, language, favorite, last_viewed_at, updated_at")
    .order("favorite", { ascending: false })
    .order("last_viewed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createThreadFor(
  supabase: ThreadClient,
  userId: string,
  data: { role: "fan" | "volunteer" | "ops"; stadium?: string; language: string },
) {
  const { data: row, error } = await supabase
    .from("threads")
    .insert({
      user_id: userId,
      role: data.role,
      stadium: data.stadium ?? null,
      language: data.language,
      title: "New conversation",
    })
    .select("id, title, role, stadium, match, language, favorite, last_viewed_at")
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function updateThreadFor(
  supabase: ThreadClient,
  data: { id: string; [key: string]: unknown },
) {
  const { id, ...patch } = data;
  const { error } = await supabase.from("threads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteThreadFor(supabase: ThreadClient, id: string) {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function saveMessageFor(
  supabase: ThreadClient,
  data: { thread_id: string; role: "user" | "assistant" | "system"; parts: any[] },
) {
  const { error } = await supabase.from("messages").insert({
    thread_id: data.thread_id,
    role: data.role,
    parts: data.parts,
  });
  if (error) throw new Error(error.message);
  if (data.role === "user") {
    const text = data.parts
      .map((p: any) => (p && p.type === "text" ? p.text : ""))
      .join(" ")
      .trim()
      .slice(0, 80);
    if (text) {
      await supabase
        .from("threads")
        .update({ title: text, updated_at: new Date().toISOString() })
        .eq("id", data.thread_id)
        .eq("title", "New conversation");
    }
  }
  return { ok: true };
}

export interface ObservabilityRow {
  total_tokens?: number | null;
  stream_duration_ms?: number | null;
  status?: string;
}

export function summarizeObservability(
  runs: ObservabilityRow[],
  tools: { status: string }[],
  feedback: { rating: string }[],
) {
  const totalTokens = runs.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
  const avgStreamMs = runs.length
    ? Math.round(runs.reduce((s, r) => s + (r.stream_duration_ms ?? 0), 0) / runs.length)
    : 0;
  const toolFail = tools.filter((t) => t.status !== "ok").length;
  const up = feedback.filter((f) => f.rating === "up").length;
  return {
    totalTokens,
    avgStreamMs,
    toolCalls: tools.length,
    toolFail,
    thumbsUp: up,
    thumbsDown: feedback.length - up,
  };
}
