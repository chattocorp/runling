import { describe, expect, spyOn, test } from "bun:test";
import { log } from "./log.ts";
import { factoryRuntime } from "./runtime.ts";
import { workflow } from "./workflow.ts";

describe("workflow", () => {
  test("defines a named callable that returns its handler result", async () => {
    const named = workflow("Quality Assurance", async (_factory, value: number) =>
      value * 2,
    );

    expect(named.workflowName).toBe("Quality Assurance");
    await expect(named(factoryRuntime, 21)).resolves.toBe(42);
  });

  test("logs its name and indents its handler", () => {
    const print = spyOn(console, "log");
    const named = workflow("Quality Assurance", () => {
      log.info("Running tests");
    });

    named(factoryRuntime);

    const lines = print.mock.calls.map((call) => call[0] as string);
    expect(lines[0]).toContain("Quality Assurance");
    expect(lines[0]).not.toMatch(/^\s/);
    expect(lines[1]).toContain("Running tests");
    expect(lines[1]).toMatch(/^ {2}/);
    print.mockRestore();
  });
});
