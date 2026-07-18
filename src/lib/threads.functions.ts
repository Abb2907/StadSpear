import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  listThreadsFor,
  createThreadFor,
  updateThreadFor,
  deleteThreadFor,
  saveMessageFor,
} from "./thread-service";

const CreateThreadSchema = z.object({
  role: z.enum(["fan", "volunteer", "ops"]).default("fan"),
  stadium: z.string().max(64).optional(),
  language: z.string().max(8).default("en"),
});

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listThreadsFor(context.supabase as any));

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateThreadSchema.parse(input))
  .handler(async ({ data, context }) =>
    createThreadFor(context.supabase as any, context.userId, data),
  );

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
  .handler(async ({ data, context }) => updateThreadFor(context.supabase as any, data));

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => deleteThreadFor(context.supabase as any, data.id));

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
    await context.supabase
      .from("threads")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", data.id);
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
  .handler(async ({ data, context }) => saveMessageFor(context.supabase as any, data));
