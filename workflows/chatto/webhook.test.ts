import { expect, test, vi } from "vitest";
import { createWorkflowContext, input, Type } from "runling";
import { createChattoPoster, createChattoWebhook } from "./webhook.ts";

test("splits long plans into thread messages without splitting Unicode characters", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const body = "a".repeat(7999) + "😀" + "b".repeat(100);
    await createChattoPoster("https://chat.example", "test")({ roomId: "dm", threadRootId: "root" }, body, new AbortController().signal);
    const messages = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
    expect(messages).toHaveLength(2);
    expect(messages.map(message => message.body).join("")).toBe(body);
    expect(messages.every(message => message.threadRootEventId === "root")).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

const delivery = (body: string, id: string, thread: string | null = "root") => ({
  version: 1 as const, id, type: "message.created" as const, triggers: ["direct_message"], occurred_at: "now",
  bot_id: "bot", room_id: "dm", thread_root_id: thread, message: { id, body, author_id: "alice" },
});

test("serializes concurrent questions and never uses queued steering as answers", async () => {
  const ready = Promise.withResolvers<void>();
  const post = vi.fn(async () => {});
  let drain!: () => string[];
  const bot = createChattoWebhook({
    name: "Test", output: Type.Array(Type.String()), post,
    async run(ctx, _delivery, _destination, inbox) {
      drain = inbox.drain;
      await ready.promise;
      return Promise.all([input(ctx, "First"), input(ctx, "Second")]);
    },
  });
  const run = bot(createWorkflowContext(), delivery("hello", "root", null));
  expect(await bot(createWorkflowContext(), delivery("steer", "steer"))).toBe("queued");
  ready.resolve();
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(drain()).toEqual(["steer"]);
  expect(drain()).toEqual([]);
  await bot.route(delivery("one", "one"), async () => { throw new Error("must not start"); });
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  await bot.route(delivery("two", "two"), async () => { throw new Error("must not start"); });
  expect(await run).toEqual(["one", "two"]);
});

test("queues startup replies and cancels before the task enters", async () => {
  const gate = Promise.withResolvers<void>();
  const work = vi.fn(async () => "done");
  const bot = createChattoWebhook({ name: "Test", output: Type.String(), post: async () => {}, run: work });
  const root = delivery("start", "root", null);
  const run = bot.route(root, async () => { await gate.promise; return bot(createWorkflowContext(), root); });
  const rejected = expect(run).rejects.toThrow("Cancelled from Chatto");
  await bot.route(delivery("/cancel", "cancel"), async () => { throw new Error("must not start"); });
  gate.resolve();
  await rejected;
  expect(work).not.toHaveBeenCalled();
});

test("skips an expired queued question without posting it", async () => {
  const post = vi.fn(async () => {});
  const bot = createChattoWebhook({
    name: "Test", output: Type.String(), post,
    async run(ctx) {
      const first = input(ctx, "First");
      const second = input(ctx, "Expired", { timeout: 0.01 });
      await expect(second).rejects.toThrow("Input timed out");
      await first;
      return "done";
    },
  });
  const run = bot(createWorkflowContext(), delivery("start", "root", null));
  await new Promise(resolve => setTimeout(resolve, 30));
  await bot.route(delivery("one", "one"), async () => null);
  await run;
  expect(post.mock.calls).toHaveLength(1);
});

test("routes replies, duplicates and unrelated messages without starting runs; retries failed starts", async () => {
  const { createChattoInputDemo } = await import("../chatto-input-demo.ts");
  const post = vi.fn(async () => {});
  const bot = createChattoInputDemo({ post });
  const delivery = (body: string, id: string, thread: string | null = null) => ({
    version: 1 as const, id, type: "message.created" as const, triggers: ["direct_message"], occurred_at: "now",
    bot_id: "bot", room_id: "dm", thread_root_id: thread, message: { id, body, author_id: "alice" },
  });
  const root = delivery("hello", "root");
  await expect(bot.route(root, async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
  let run!: ReturnType<typeof bot>;
  const start = vi.fn(async () => { run = bot(createWorkflowContext(), root); return { id: "run-id" }; });
  expect(await bot.route(root, start)).toEqual({ id: "run-id" });
  expect(await bot.route(root, start)).toBeNull();
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(await bot.route(delivery("Alice", "name", "root"), start)).toBeNull();
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(await bot.route(delivery("Testing", "topic", "root"), start)).toBeNull();
  expect(await run).toEqual({ name: "Alice", topic: "Testing" });
  expect(await bot.route(delivery("late", "late", "root"), start)).toBeNull();
  expect(start).toHaveBeenCalledTimes(1);
});
