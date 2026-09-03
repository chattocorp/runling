import { afterEach, describe, expect, test } from "bun:test";
import {
  executeWorkflow,
  formatDuration,
  normalizeWorkflowResult,
} from "./runner.ts";
import { recordTokenUsage, resetTokenUsage } from "./usage.ts";

const initialExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = initialExitCode ?? 0;
  resetTokenUsage();
});

describe("executeWorkflow", () => {
  const invocation = {
    cwd: "/project",
    prompt: "Make the change",
    verbose: false,
  };

  test("injects the runtime and invocation", async () => {
    await executeWorkflow(async (factory, receivedInvocation) => {
      expect(factory.agent).toBeFunction();
      expect(factory.createShell).toBeFunction();
      expect(factory.step).toBeFunction();
      expect(factory.withRetries).toBeFunction();
      expect(receivedInvocation).toEqual(invocation);
    }, invocation);
  });

  test("logs a workflow summary", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => "Made the change", invocation);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Made the change"))).toBe(true);
  });

  test("accepts structured workflow results", async () => {
    const execution = await executeWorkflow(
      async () => ({
        summary: "Opened the pull request",
        outputs: { pullRequestUrl: "https://example.com/pull/1" },
      }),
      invocation,
    );

    expect(execution.ok).toBe(true);
    expect(execution.result).toEqual({
      summary: "Opened the pull request",
      outputs: { pullRequestUrl: "https://example.com/pull/1" },
    });
  });

  test("emits only the execution document to stdout in JSON mode", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => output.push(message);
    console.error = (message: string) => errors.push(message);

    try {
      await executeWorkflow(
        async () => ({ summary: "Done", outputs: { count: 2 } }),
        invocation,
        { json: true },
      );
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      error: null,
      result: { summary: "Done", outputs: { count: 2 } },
    });
    expect(errors.some((line) => line.includes("Factory starting"))).toBe(true);
    expect(errors.some((line) => line.includes("Finished in "))).toBe(true);
  });

  test("indents workflow log output below the factory greeting", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async ({ log }) => {
        log.info("inside the workflow");
        return "Made the change";
      }, invocation);
    } finally {
      console.log = originalLog;
    }

    const greeting = logs.find((line) => line.includes("Factory starting"));
    const inside = logs.find((line) => line.includes("inside the workflow"));
    const summary = logs.find((line) => line.includes("Made the change"));
    const finished = logs.find((line) => line.includes("Finished in "));

    expect(greeting).toBeDefined();
    expect(greeting).not.toMatch(/^\s/);
    expect(inside).toBeDefined();
    expect(inside).toMatch(/^ {2}/);
    expect(summary).toBeDefined();
    expect(summary).not.toMatch(/^\s/);
    expect(finished).not.toMatch(/^\s/);
  });

  test("logs failures and applies a nonzero exit code", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message: string) => errors.push(message);

    try {
      await executeWorkflow(async () => {
        throw "Tests failed";
      }, invocation);
    } finally {
      console.error = originalError;
    }

    expect(errors.some((line) => line.includes("Tests failed"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test("logs the elapsed time after a successful run", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => undefined, invocation);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Finished in "))).toBe(true);
  });

  test("logs the elapsed time after a failed run", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => {
        throw "Tests failed";
      }, invocation);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Finished in "))).toBe(true);
  });

  test("logs accumulated token usage from agent interactions", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => {
        recordTokenUsage({ input: 100, output: 20, cacheRead: 500, cacheWrite: 10 });
        recordTokenUsage({ input: 50, output: 25, cacheRead: 550, cacheWrite: 15 });
      }, invocation);
    } finally {
      console.log = originalLog;
    }

    expect(
      logs.some((line) =>
        line.includes(
          "Total token usage: in 150, out 45, cache read 1,050, cache write 25",
        ),
      ),
    ).toBe(true);
    expect(logs.some((line) => line.includes("Finished in "))).toBe(true);
  });

  test("omits the token usage line when no tokens were recorded", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => undefined, invocation);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Total token usage"))).toBe(false);
  });

  test("resets token usage totals between executions", async () => {
    recordTokenUsage({ input: 999, output: 999, cacheRead: 999, cacheWrite: 999 });
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => {
        recordTokenUsage({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });
      }, invocation);
    } finally {
      console.log = originalLog;
    }

    expect(
      logs.some((line) =>
        line.includes("Total token usage: in 10, out 5"),
      ),
    ).toBe(true);
    expect(logs.some((line) => line.includes("999"))).toBe(false);
  });
});

describe("normalizeWorkflowResult", () => {
  test("keeps string-returning workflows compatible", () => {
    expect(normalizeWorkflowResult("Made the change")).toEqual({
      summary: "Made the change",
    });
  });

  test("rejects outputs that cannot be represented as JSON", () => {
    expect(() =>
      normalizeWorkflowResult({
        summary: "Invalid",
        outputs: { value: Number.NaN },
      }),
    ).toThrow("Workflow must return a string, a structured result, or nothing");
  });
});

describe("formatDuration", () => {
  test("formats sub-second durations in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(42.4)).toBe("42ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("formats sub-minute durations in seconds", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(12_345)).toBe("12.3s");
  });

  test("formats durations in minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(61_000)).toBe("1m1s");
    expect(formatDuration(125_000)).toBe("2m5s");
  });

  test("formats durations in hours, minutes, and seconds", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_660_000)).toBe("1h1m");
    expect(formatDuration(3_661_000)).toBe("1h1m1s");
    expect(formatDuration(7_385_000)).toBe("2h3m5s");
  });
});
