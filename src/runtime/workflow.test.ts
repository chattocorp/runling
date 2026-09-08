import { describe, expect, expectTypeOf, test } from "vitest";
import { Type } from "typebox";
import { task, isTask, isSchemaTask } from "./workflow.ts";
import { observeRunlingEvents, type RunlingEvent } from "./events.ts";

describe("task", () => {
  test("wraps a normal variadic function and preserves sync results and this", () => {
    const add = task(function add(this: { base: number }, ...values: number[]) {
      return this.base + values.reduce((a, b) => a + b, 0);
    });
    expectTypeOf<ReturnType<typeof add>>().toEqualTypeOf<number>();
    expect(add.call({ base: 10 }, 1, 2, 3)).toBe(16);
    expect(isTask(add)).toBe(true);
    expect(isSchemaTask(add)).toBe(false);
  });

  test("preserves an ordinary async function's promise", async () => {
    const promise = Promise.resolve("done" as const);
    const run = task(() => promise);
    expect(run()).toBe(promise);
    expectTypeOf<ReturnType<typeof run>>().toEqualTypeOf<Promise<"done">>();
    await expect(run()).resolves.toBe("done");
  });

  test("schema input is explicit and invalid input does not start an activity", () => {
    const events: RunlingEvent[] = [];
    const echo = task({ name: "Echo", input: Type.String(), output: Type.String() }, (input) => input);
    expectTypeOf<Parameters<typeof echo>>().toEqualTypeOf<[string]>();
    observeRunlingEvents(e => events.push(e), () => {
      // @ts-expect-error Input is required.
      expect(() => echo()).toThrow('Task "Echo" input is invalid');
      expect(events).toEqual([]);
      expect(echo("")).toBe("");
    });
    expect(isSchemaTask(echo)).toBe(true);
  });

  test("nested tasks preserve inputs and activity parentage", async () => {
    const events: RunlingEvent[] = [];
    const child = task(function child(value: string) { return `${value} child`; });
    const parent = task(async function parent(value: string) { return child(value); });
    await observeRunlingEvents(e => events.push(e), async () => {
      expect(await parent("hello")).toBe("hello child");
    });
    const starts = events.filter(e => e.type === "step.started");
    expect(starts).toHaveLength(2);
    expect(starts[1]?.activityId).toBe(starts[0]?.id);
  });

  test.each(["input", "output"] as const)("rejects invalid %s schemas", boundary => {
    expect(() => task({ name: "Invalid", input: Type.String(), output: Type.String(), [boundary]: { type: "invalid" } } as never, () => "unused")).toThrow("schema is invalid");
  });

  test("validates sync and async outputs", async () => {
    const definition = { name: "Broken", input: Type.String(), output: Type.String() };
    const sync = task(definition, (_input) => 42);
    const asyncTask = task(definition, async (_input) => 42);
    expect(() => sync("input")).toThrow('Task "Broken" output is invalid');
    await expect(asyncTask("input")).rejects.toThrow('Task "Broken" output is invalid');
  });

  test("preserves thrown errors and records failure", async () => {
    const error = new Error("failed");
    const events: RunlingEvent[] = [];
    await observeRunlingEvents(e => events.push(e), async () => {
      expect(() => task(() => { throw error; })()).toThrow(error);
      await expect(task(async () => { throw error; })()).rejects.toBe(error);
    });
    expect(events.filter(e => e.type === "step.finished").map(e => e.status)).toEqual(["failed", "failed"]);
  });

  test("preserves null input", () => {
    const run = task({ name: "Null", input: Type.Null(), output: Type.Null() }, (value) => value);
    expect(run(null)).toBeNull();
  });
});
