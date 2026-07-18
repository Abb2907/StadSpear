import { describe, it, expect, vi } from "vitest";
import {
  listThreadsFor,
  createThreadFor,
  updateThreadFor,
  deleteThreadFor,
  saveMessageFor,
  summarizeObservability,
} from "@/lib/thread-service";

/** Chainable Supabase query mock returning the given final result. */
function makeQuery(result: { data?: unknown; error?: { message: string } | null }) {
  const q: any = {
    _result: result,
    select: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onF: any, onR: any) => Promise.resolve(result).then(onF, onR),
  };
  return q;
}

function makeClient(routes: Record<string, ReturnType<typeof makeQuery>>) {
  return { from: vi.fn((table: string) => routes[table]) };
}

describe("listThreadsFor", () => {
  it("returns rows on success", async () => {
    const q = makeQuery({ data: [{ id: "t1" }], error: null });
    const client = makeClient({ threads: q });
    const rows = await listThreadsFor(client);
    expect(rows).toEqual([{ id: "t1" }]);
    expect(q.order).toHaveBeenCalled();
    expect(q.limit).toHaveBeenCalledWith(100);
  });

  it("throws on error", async () => {
    const q = makeQuery({ data: null, error: { message: "boom" } });
    const client = makeClient({ threads: q });
    await expect(listThreadsFor(client)).rejects.toThrow("boom");
  });

  it("returns [] when data is null", async () => {
    const q = makeQuery({ data: null, error: null });
    const client = makeClient({ threads: q });
    expect(await listThreadsFor(client)).toEqual([]);
  });
});

describe("createThreadFor", () => {
  it("inserts thread and returns row", async () => {
    const q = makeQuery({ data: { id: "t1", title: "New conversation" }, error: null });
    const client = makeClient({ threads: q });
    const row = await createThreadFor(client, "user-1", { role: "fan", language: "en", stadium: "MetLife" });
    expect(row).toMatchObject({ id: "t1" });
    expect(q.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", role: "fan", stadium: "MetLife", language: "en" }),
    );
  });

  it("defaults stadium to null when not provided", async () => {
    const q = makeQuery({ data: { id: "t2" }, error: null });
    const client = makeClient({ threads: q });
    await createThreadFor(client, "user-1", { role: "ops", language: "es" });
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ stadium: null }));
  });

  it("throws on insert error", async () => {
    const q = makeQuery({ data: null, error: { message: "rls" } });
    const client = makeClient({ threads: q });
    await expect(
      createThreadFor(client, "u", { role: "fan", language: "en" }),
    ).rejects.toThrow("rls");
  });
});

describe("updateThreadFor", () => {
  it("patches only supplied fields", async () => {
    const q = makeQuery({ error: null });
    const client = makeClient({ threads: q });
    await updateThreadFor(client, { id: "t1", favorite: true });
    expect(q.update).toHaveBeenCalledWith({ favorite: true });
    expect(q.eq).toHaveBeenCalledWith("id", "t1");
  });

  it("throws on error", async () => {
    const q = makeQuery({ error: { message: "denied" } });
    const client = makeClient({ threads: q });
    await expect(updateThreadFor(client, { id: "t1", favorite: true })).rejects.toThrow("denied");
  });
});

describe("deleteThreadFor", () => {
  it("deletes by id", async () => {
    const q = makeQuery({ error: null });
    const client = makeClient({ threads: q });
    await deleteThreadFor(client, "t1");
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("id", "t1");
  });
});

describe("saveMessageFor", () => {
  it("inserts assistant messages without touching thread title", async () => {
    const messages = makeQuery({ error: null });
    const threads = makeQuery({ error: null });
    const client = makeClient({ messages, threads });
    await saveMessageFor(client, {
      thread_id: "t1",
      role: "assistant",
      parts: [{ type: "text", text: "Hi" }],
    });
    expect(messages.insert).toHaveBeenCalled();
    expect(threads.update).not.toHaveBeenCalled();
  });

  it("renames thread from default title on first user message", async () => {
    const messages = makeQuery({ error: null });
    const threads = makeQuery({ error: null });
    const client = makeClient({ messages, threads });
    await saveMessageFor(client, {
      thread_id: "t1",
      role: "user",
      parts: [{ type: "text", text: "Where is Gate A?" }],
    });
    expect(threads.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Where is Gate A?" }),
    );
    expect(threads.eq).toHaveBeenCalledWith("title", "New conversation");
  });

  it("does not attempt title update when user message has no text", async () => {
    const messages = makeQuery({ error: null });
    const threads = makeQuery({ error: null });
    const client = makeClient({ messages, threads });
    await saveMessageFor(client, { thread_id: "t1", role: "user", parts: [] });
    expect(threads.update).not.toHaveBeenCalled();
  });

  it("throws when insert fails", async () => {
    const messages = makeQuery({ error: { message: "fk" } });
    const client = makeClient({ messages });
    await expect(
      saveMessageFor(client, { thread_id: "t1", role: "user", parts: [] }),
    ).rejects.toThrow("fk");
  });
});

describe("summarizeObservability", () => {
  it("aggregates tokens, avg stream time, tool failures, and feedback", () => {
    const summary = summarizeObservability(
      [
        { total_tokens: 100, stream_duration_ms: 1000, status: "ok" },
        { total_tokens: 200, stream_duration_ms: 2000, status: "ok" },
      ],
      [{ status: "ok" }, { status: "error" }, { status: "error" }],
      [{ rating: "up" }, { rating: "up" }, { rating: "down" }],
    );
    expect(summary).toEqual({
      totalTokens: 300,
      avgStreamMs: 1500,
      toolCalls: 3,
      toolFail: 2,
      thumbsUp: 2,
      thumbsDown: 1,
    });
  });

  it("handles empty inputs without dividing by zero", () => {
    expect(summarizeObservability([], [], [])).toEqual({
      totalTokens: 0,
      avgStreamMs: 0,
      toolCalls: 0,
      toolFail: 0,
      thumbsUp: 0,
      thumbsDown: 0,
    });
  });

  it("treats missing token/duration fields as zero", () => {
    const s = summarizeObservability([{ status: "ok" }, { status: "ok" }], [], []);
    expect(s.totalTokens).toBe(0);
    expect(s.avgStreamMs).toBe(0);
  });
});
