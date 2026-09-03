import { describe, expect, test } from "bun:test";
import type { Factory } from "./runtime.ts";
import { workflow } from "./workflow.ts";

describe("workflow", () => {
  test("runs with its name as a step and preserves arguments and results", async () => {
    const steps: string[] = [];
    const f = {
      step: <T>(name: string, run: () => T) => {
        steps.push(name);
        return run();
      },
    } as Factory;
    const greet = workflow("Greet", async (_f, name: string) => `Hello ${name}`);

    await expect(greet(f, "Factory")).resolves.toBe("Hello Factory");
    expect(steps).toEqual(["Greet"]);
  });
});
