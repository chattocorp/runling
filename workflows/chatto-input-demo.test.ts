import { describe, expect, it, vi } from "vitest";
import { createWorkflowContext } from "runling";
import { createChattoInputDemo, createChattoPoster } from "./chatto-input-demo.ts";

function delivery(body: string, author = "alice", id: string = crypto.randomUUID(), threadRootId: string | null = null) {
  return {
    version: 1 as const, id, type: "message.created" as const,
    triggers: ["direct_message"], occurred_at: new Date().toISOString(),
    bot_id: "bot", room_id: "dm", thread_root_id: threadRootId,
    message: { id, author_id: author, body },
  };
}

describe("Chatto input demo", () => {
  it.each([-1, NaN, Infinity, 2_147_483.648])("rejects invalid timeout %s at creation", (timeout) => {
    expect(() => createChattoInputDemo({ post: async () => {}, timeout }))
      .toThrow(RangeError);
  });

  it("starts from any root DM and resumes only in its thread", async () => {
    const post = vi.fn<Parameters<typeof createChattoInputDemo>[0]["post"]>(async () => {});
    const bot = createChattoInputDemo({ post });
    const start = delivery("Hello there", "alice", "root-message");
    const thread = start.message.id;
    const run = bot(createWorkflowContext(), start);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(await bot(createWorkflowContext(), start)).toBe("duplicate");
    expect(await bot(createWorkflowContext(), delivery("wrong person", "bob", "wrong-person", thread))).toBe("ignored");
    expect(await bot(createWorkflowContext(), delivery("unrelated thread", "alice", "unrelated", "another-thread"))).toBe("ignored");
    await bot(createWorkflowContext(), delivery("Alice", "alice", "name", thread));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await bot(createWorkflowContext(), delivery("A demo", "alice", "topic", thread));
    expect(await run).toEqual({ name: "Alice", topic: "A demo" });
    expect(post).toHaveBeenCalledTimes(3);
    for (const call of post.mock.calls) expect(call[0]).toEqual({ roomId: "dm", threadRootId: thread });
    expect(post.mock.calls[2]).toEqual([
      { roomId: "dm", threadRootId: thread },
      "Thanks! Your name: Alice\nYour topic: A demo", expect.any(AbortSignal),
    ]);
  });

  it("keeps concurrent conversations separate", async () => {
    const post = vi.fn<Parameters<typeof createChattoInputDemo>[0]["post"]>(async () => {});
    const bot = createChattoInputDemo({ post });
    const starts = [delivery("start", "alice", "first"), delivery("start", "alice", "second")];
    const runs = starts.map((start) => bot(createWorkflowContext(), start));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await bot(createWorkflowContext(), delivery("Bob", "alice", "name-two", "second"));
    await bot(createWorkflowContext(), delivery("Alice", "alice", "name-one", "first"));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(4));
    await bot(createWorkflowContext(), delivery("One", "alice", "topic-one", "first"));
    await bot(createWorkflowContext(), delivery("Two", "alice", "topic-two", "second"));
    expect(await Promise.all(runs)).toEqual([{ name: "Alice", topic: "One" }, { name: "Bob", topic: "Two" }]);
  });

  it("cleans up when a workflow aborts or posting fails", async () => {
    const post = vi.fn<Parameters<typeof createChattoInputDemo>[0]["post"]>(async () => {});
    const bot = createChattoInputDemo({ post });
    const ctx = createWorkflowContext();
    const run = bot(ctx, delivery("start"));
    const rejected = expect(run).rejects.toThrow("Stop");
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(() => ctx.abort("Stop")).toThrow("Stop");
    await rejected;
    post.mockRejectedValueOnce(new Error("offline"));
    await expect(bot(createWorkflowContext(), delivery("start"))).rejects.toThrow("offline");
    expect(await bot(createWorkflowContext(), delivery("late answer", "alice", "late", "root-message"))).toBe("ignored");
  });

  it("times out a waiting question", async () => {
    const bot = createChattoInputDemo({ post: async () => {}, timeout: 0.01 });
    await expect(bot(createWorkflowContext(), delivery("start"))).rejects.toThrow();
    expect(await bot(createWorkflowContext(), delivery("late answer", "alice", "late", "root-message"))).toBe("ignored");
  });

  it("posts through ConnectRPC without retrying a failed request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const post = createChattoPoster("https://chat.example", "test-key");
      await expect(post({ roomId: "room", threadRootId: "thread" }, "Question?", new AbortController().signal))
        .rejects.toThrow("403");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
        roomId: "room", threadRootEventId: "thread", body: "Question?",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
