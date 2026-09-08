import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import * as v from "valibot";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Type } from "typebox";
import { task, isSchemaTask } from "./workflow.ts";
import { isWorkflowSchema, validateSchema } from "./schema.ts";
import { observeRunlingEvents, type RunlingEvent } from "./events.ts";
import { runWorkflow } from "./runner.ts";

describe("Standard Schema tasks", () => {
  test("infers Zod input and output types and applies both transforms", async () => {
    const length = task({
      name: "Length",
      input: z.string().transform(value => value.length),
      output: z.number().transform(value => ({ length: value })),
    }, input => {
      expectTypeOf(input).toEqualTypeOf<number>();
      return input;
    });
    expectTypeOf<Parameters<typeof length>>().toEqualTypeOf<[string]>();
    expectTypeOf<ReturnType<typeof length>>().toEqualTypeOf<Promise<{ length: number }>>();
    expect(isSchemaTask(length)).toBe(true);
    await expect(length("hello")).resolves.toEqual({ length: 5 });
    const execution = await runWorkflow(length, { input: "hello" });
    expect(execution.ok).toBe(true);
    expect(execution.output).toEqual({ length: 5 });
  });

  test("accepts Valibot and infers its parsed input", async () => {
    const length = task({
      name: "Length",
      input: v.pipe(v.string(), v.transform(value => value.length)),
      output: v.number(),
    }, value => {
      expectTypeOf(value).toEqualTypeOf<number>();
      return value;
    });
    expectTypeOf<Parameters<typeof length>>().toEqualTypeOf<[string]>();
    expectTypeOf<ReturnType<typeof length>>().toEqualTypeOf<Promise<number>>();
    await expect(length("hello")).resolves.toBe(5);
    await expect(length(42 as never)).rejects.toThrow('Task "Length" input is invalid');
  });

  test("supports mixed Standard Schema and TypeBox boundaries", async () => {
    const first = task({ name: "First", input: z.string(), output: Type.String() }, value => value);
    const second = task({ name: "Second", input: Type.String(), output: z.string() }, value => value);
    expectTypeOf<ReturnType<typeof first>>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<ReturnType<typeof second>>().toEqualTypeOf<Promise<string>>();
    await expect(first("one")).resolves.toBe("one");
    await expect(second("two")).resolves.toBe("two");
  });

  test("waits for async input validation before starting an activity", async () => {
    const events: RunlingEvent[] = [];
    const echo = task({
      name: "Async",
      input: z.string().refine(async value => value === "ok", "Expected ok"),
      output: z.string(),
    }, value => value);
    await observeRunlingEvents(event => events.push(event), async () => {
      await expect(echo("bad")).rejects.toThrow("Expected ok");
      expect(events).toEqual([]);
      await expect(echo("ok")).resolves.toBe("ok");
    });
    expect(events.filter(event => event.type === "step.finished")).toMatchObject([{ status: "completed" }]);
  });

  test("records async output validation failure inside the task activity", async () => {
    const events: RunlingEvent[] = [];
    const echo = task({
      name: "Async output",
      input: z.string(),
      output: z.string().refine(async () => false, "Output rejected"),
    }, async value => value);
    await observeRunlingEvents(event => events.push(event), async () => {
      await expect(echo("hello")).rejects.toThrow('Task "Async output" output is invalid');
    });
    expect(events.filter(event => event.type === "step.finished")).toMatchObject([{ status: "failed" }]);
  });

  test("preserves implementation errors and this", async () => {
    const error = new Error("failed");
    const echo = task({ name: "Echo", input: z.string(), output: z.string() }, function (this: { fail: boolean }, value) {
      if (this.fail) throw error;
      return value;
    });
    await expect(echo.call({ fail: true }, "hello")).rejects.toBe(error);
    await expect(echo.call({ fail: false }, "hello")).resolves.toBe("hello");
  });

  test("normalizes issue paths and accepts callable schema objects", async () => {
    const schema = Object.assign(() => {}, {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => ({ issues: [{ message: "Invalid", path: [{ key: "a/b~c" }, 0] }] }),
      },
    }) satisfies StandardSchemaV1;
    expect(isWorkflowSchema(schema)).toBe(true);
    expect(await validateSchema(schema, null)).toEqual({ issues: [{ message: "Invalid", path: "/a~1b~0c/0" }] });
  });

  test.each([
    { version: 2, vendor: "test", validate: () => ({ value: "ok" }) },
    { version: 1, validate: () => ({ value: "ok" }) },
    { version: 1, vendor: "test" },
  ])("rejects malformed Standard Schema metadata", standard => {
    expect(isWorkflowSchema({ "~standard": standard })).toBe(false);
  });

  test("requires the implementation result to match the output schema input", () => {
    // @ts-expect-error The implementation must return a string for the output parser.
    task({ name: "Invalid", input: z.string(), output: z.string() }, () => 42);
  });
});
