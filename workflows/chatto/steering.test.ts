import { expect, test, vi } from "vitest";
import { withChattoSteering } from "./steering.ts";

function inboxFixture() {
  let messages: string[] = [];
  const listeners = new Set<() => void>();
  return {
    drain: () => messages.splice(0),
    prepend: (values: string[]) => { messages = [...values, ...messages]; },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    push: (text: string) => { messages.push(text); for (const listener of listeners) listener(); },
    listeners,
  };
}

test("delivers while running, keeps commands separate and restores undelivered messages in order", async () => {
  const inbox = inboxFixture();
  const work = Promise.withResolvers<string>();
  const late = Promise.withResolvers<boolean>();
  const agent = { steer: vi.fn(async (text: string) => text === "late" ? late.promise : true) };
  inbox.push("initial");
  const run = withChattoSteering(inbox, agent, () => work.promise, ["/approve"]);
  inbox.push("/approve");
  inbox.push("late");
  expect(agent.steer.mock.calls).toEqual([["initial"], ["late"]]);
  work.resolve("done");
  await vi.waitFor(() => expect(inbox.listeners.size).toBe(0));
  inbox.push("after completion");
  late.resolve(false);
  expect(await run).toBe("done");
  expect(inbox.drain()).toEqual(["/approve", "late", "after completion"]);
});

test("restores rejected steering and unsubscribes when work fails", async () => {
  const inbox = inboxFixture();
  const work = Promise.withResolvers<string>();
  const agent = { steer: vi.fn(async () => { throw new Error("cannot queue"); }) };
  const run = withChattoSteering(inbox, agent, () => work.promise);
  const failed = expect(run).rejects.toThrow("work failed");
  inbox.push("feedback");
  work.reject(new Error("work failed"));
  await failed;
  expect(inbox.listeners.size).toBe(0);
  expect(inbox.drain()).toEqual(["feedback"]);
});
