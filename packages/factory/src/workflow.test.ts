import { describe, expect, expectTypeOf, test } from "vitest";
import { Type } from "typebox";
import type { Factory } from "./runtime.ts";
import { workflow } from "./workflow.ts";

describe("workflow", () => {
  test("requires explicit input and never falls back to the factory prompt", async () => {
    const steps: string[] = [];
    const f = {
      prompt: "Do not use this",
      step: <T>(name: string, run: () => T) => {
        steps.push(name);
        return run();
      },
    } as Factory;
    const echo = workflow(
      { name: "Echo", input: Type.String(), output: Type.String() },
      (_f, input) => input,
    );
    expectTypeOf<Parameters<typeof echo>>().toEqualTypeOf<[Factory, string]>();
    // @ts-expect-error Workflow calls require the input argument.
    await expect(echo(f)).rejects.toThrow('Workflow "Echo" input is invalid');
    // @ts-expect-error Undefined is not a string input.
    await expect(echo(f, undefined)).rejects.toThrow('Workflow "Echo" input is invalid');
    expect(steps).toEqual([]);
    await expect(echo(f, "")).resolves.toBe("");
    expect(steps).toEqual(["Echo"]);
  });

  test("nested workflows use explicit inputs and remain nested steps", async () => {
    const steps: string[] = [];
    const f = {
      prompt: "Unrelated request",
      step: async <T>(name: string, run: () => T) => {
        steps.push(`start:${name}`);
        const result = await run();
        steps.push(`end:${name}`);
        return result;
      },
    } as Factory;
    const child = workflow(
      { name: "Child", input: Type.String(), output: Type.String() },
      (_f, input) => input,
    );
    const parent = workflow(
      { name: "Parent", input: Type.String(), output: Type.String() },
      (f, input) => child(f, `${input} to child`),
    );
    await expect(parent(f, "Passed")).resolves.toBe("Passed to child");
    expect(steps).toEqual(["start:Parent", "start:Child", "end:Child", "end:Parent"]);
  });
  test.each(["input", "output"] as const)("rejects an invalid %s schema when defined", (boundary) => {
    expect(() => workflow({
      name: "Invalid schema",
      input: Type.String(),
      output: Type.String(),
      [boundary]: { type: "invalid" },
    } as never, () => "unused")).toThrow(`${boundary} schema is invalid`);
  });
  test("runs with its name as a step and preserves arguments and results", async () => {
    const steps: string[] = [];
    const f = {
      step: <T>(name: string, run: () => T) => {
        steps.push(name);
        return run();
      },
    } as Factory;
    const greet = workflow(
      {
        name: "Greet",
        input: Type.String(),
        output: Type.String(),
      },
      async (_f, name) => `Hello ${name}`,
    );

    await expect(greet(f, "Factory")).resolves.toBe("Hello Factory");
    expect(steps).toEqual(["Greet"]);
    expect(greet.input).toMatchObject({ type: "string" });
    expect(greet.output).toMatchObject({ type: "string" });
  });

  test("validates workflow input before starting its step", async () => {
    let started = false;
    const f = {
      prompt: "",
      step: <T>(_name: string, run: () => T) => {
        started = true;
        return run();
      },
    } as Factory;
    const greet = workflow(
      {
        name: "Greet",
        input: Type.Object({ name: Type.String() }),
        output: Type.String(),
      },
      async (_f, { name }) => `Hello ${name}`,
    );

    await expect(greet(f, { name: 42 } as never)).rejects.toThrow(
      'Workflow "Greet" input is invalid',
    );
    expect(started).toBe(false);
  });

  test("validates workflow output", async () => {
    const f = {
      prompt: "",
      step: <T>(_name: string, run: () => T) => run(),
    } as Factory;
    const broken = workflow(
      {
        name: "Broken",
        input: Type.String(),
        output: Type.Object({ result: Type.String() }),
      },
      async () => ({ result: 42 }) as never,
    );

    await expect(broken(f, "input")).rejects.toThrow(
      'Workflow "Broken" output is invalid',
    );
  });

  test("preserves null as an explicit input", async () => {
    const f = {
      prompt: "fallback",
      step: <T>(_name: string, run: () => T) => run(),
    } as Factory;
    const nullable = workflow(
      {
        name: "Nullable",
        input: Type.Union([Type.String(), Type.Null()]),
        output: Type.Union([Type.String(), Type.Null()]),
      },
      async (_f, input) => input,
    );

    await expect(nullable(f, null)).resolves.toBeNull();
  });
});
