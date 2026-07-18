import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateThreadSchema = z.object({
  role: z.enum(["fan", "volunteer", "ops"]).default("fan"),
  stadium: z.string().max(64).optional(),
  language: z.string().max(8).default("en"),
});

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, role, stadium, match, language, favorite, last_viewed_at, updated_at")
      .order("favorite", { ascending: false })
      .order("last_viewed_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateThreadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("threads")
      .insert({
        user_id: context.userId,
        role: data.role,
        stadium: data.stadium ?? null,
        language: data.language,
        title: "New conversation",
      })
      .select("id, title, role, stadium, match, language, favorite, last_viewed_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateThreadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(120).optional(),
  role: z.enum(["fan", "volunteer", "ops"]).optional(),
  stadium: z.string().max(64).nullable().optional(),
  match: z.string().max(120).nullable().optional(),
  language: z.string().max(8).optional(),
  favorite: z.boolean().optional(),
  last_viewed_at: z.string().optional(),
});

export const updateThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateThreadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("threads").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [threadRes, msgRes] = await Promise.all([
      context.supabase
        .from("threads")
        .select("id, title, role, stadium, match, language, favorite, last_viewed_at")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", data.id)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    if (threadRes.error) throw new Error(threadRes.error.message);
    if (!threadRes.data) throw new Error("Thread not found");
    if (msgRes.error) throw new Error(msgRes.error.message);
    // touch last_viewed_at
    await context.supabase.from("threads").update({ last_viewed_at: new Date().toISOString() }).eq("id", data.id);
    return { thread: threadRes.data, messages: msgRes.data ?? [] };
  });

const SaveMessageSchema = z.object({
  thread_id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.any()),
});

export const saveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("messages").insert({
      thread_id: data.thread_id,
      role: data.role,
      parts: data.parts,
    });
    if (error) throw new Error(error.message);
    // If this is the first user message, use its text as thread title.
    if (data.role === "user") {
      const text = data.parts
        .map((p: any) => (p && p.type === "text" ? p.text : ""))
        .join(" ")
        .trim()
        .slice(0, 80);
      if (text) {
        await context.supabase
          .from("threads")
          .update({ title: text, updated_at: new Date().toISOString() })
          .eq("id", data.thread_id)
          .eq("title", "New conversation");
      }
    }
    return { ok: true };
  });
