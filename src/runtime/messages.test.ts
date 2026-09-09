import { expect, test } from "vitest";
import { createMessageChannel } from "./messages.ts";

test("handoff requires a receiver and releases it without losing in-flight acknowledgement", async () => {
  const channel = createMessageChannel();
  expect(await channel.send("early")).toBe(false);
  let finish!: (value: boolean) => void;
  const release = channel.subscribe(() => new Promise(resolve => { finish = resolve; }));
  const delivered = channel.send("during");
  expect(() => channel.subscribe(async () => true)).toThrow("already has a receiver");
  release();
  expect(await channel.send("late")).toBe(false);
  finish(true);
  expect(await delivered).toBe(true);
  channel.subscribe(async () => true);
  release();
  expect(await channel.send("next")).toBe(true);
});

test("independent channels preserve rejection and failure as non-delivery", async () => {
  const a = createMessageChannel();
  const b = createMessageChannel();
  a.subscribe(async () => true);
  const release = b.subscribe(async () => false);
  expect(await a.send("one")).toBe(true);
  expect(await b.send("two")).toBe(false);
  release();
  b.subscribe(async () => { throw new Error("stopped"); });
  expect(await b.send("three")).toBe(false);
});
