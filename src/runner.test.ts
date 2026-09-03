import { afterEach, describe, expect, test } from "bun:test";
import {
  executeWorkflow,
  formatDuration,
  formatWorkflowDetails,
  normalizeWorkflowResult,
  shouldUseTui,
} from "./runner.ts";
import { createFactory, type Factory } from "./runtime.ts";
import { recordTokenUsage, resetTokenUsage } from "./usage.ts";

const initialExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = initialExitCode ?? 0;
  resetTokenUsage();
});

describe("executeWorkflow", () => {
  const baseFactory = createFactory({
    cwd: "/project",
    prompt: "Make the change",
    verbose: false,
  });
  const f: Factory = {
    ...baseFactory,
    runAgent: async () => ({
      outcome: "completed",
      summary: "Why do programmers prefer dark mode? Because light attracts bugs!",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }),
  };

  test("generates and tells a joke before running the workflow", async () => {
    const events: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => events.push(message);
    const jokeFactory: Factory = {
      ...baseFactory,
      runAgent: async (prompt, options) => {
        events.push("generated joke");
        expect(prompt).toContain("one short, family-friendly joke");
        expect(options).toMatchObject({
          model: "openai-codex/gpt-5.6-sol",
          thinkingLevel: "minimal",
          tools: [],
          resources: {
            extensions: false,
            skills: false,
            promptTemplates: false,
            themes: false,
            contextFiles: false,
          },
        });
        return {
          outcome: "completed",
          summary: "A generated test joke",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        };
      },
    };

    try {
      await executeWorkflow(async () => {
        events.push("workflow ran");
      }, jokeFactory);
    } finally {
      console.log = originalLog;
    }

    expect(events.indexOf("generated joke")).toBeLessThan(
      events.indexOf("workflow ran"),
    );
    expect(
      events.some((event) => event.includes("Joke: A generated test joke")),
    ).toBe(true);
  });

  test("does not run the workflow when joke generation fails", async () => {
    let workflowRan = false;
    const jokeFactory: Factory = {
      ...baseFactory,
      runAgent: async () => ({
        outcome: "failed",
        summary: "Could not generate a joke",
        usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    };

    const execution = await executeWorkflow(async () => {
      workflowRan = true;
    }, jokeFactory);

    expect(workflowRan).toBe(false);
    expect(execution).toMatchObject({
      ok: false,
      error: "Could not generate a joke",
      result: null,
    });
  });

  test("passes one factory containing primitives and invocation values", async () => {
    await executeWorkflow(async (receivedFactory) => {
      expect(receivedFactory).toBe(f);
      expect(receivedFactory.agent).toBeFunction();
      expect(receivedFactory.shell).toBeFunction();
      expect(receivedFactory.createShell).toBeFunction();
      expect(receivedFactory.step).toBeFunction();
      expect(receivedFactory.cwd).toBe("/project");
      expect(receivedFactory.prompt).toBe("Make the change");
    }, f);
  });

  test("logs a workflow summary", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(async () => "Made the change", f);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Made the change"))).toBe(true);
  });

  test("accepts structured workflow results", async () => {
    const execution = await executeWorkflow(
      async () => ({
        summary: "Opened the pull request",
        details: "## Summary\n\nImplemented the requested change.",
        outputs: { pullRequestUrl: "https://example.com/pull/1" },
      }),
      f,
    );

    expect(execution.ok).toBe(true);
    expect(execution.result).toEqual({
      summary: "Opened the pull request",
      details: "## Summary\n\nImplemented the requested change.",
      outputs: { pullRequestUrl: "https://example.com/pull/1" },
    });
  });

  test("preserves raw result details when stdout is not interactive", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(
        async () => ({
          summary: "Review complete",
          details: "## Findings\n\nSomething worth reading.",
        }),
        f,
        { terminal: { isTTY: false, columns: 80 } },
      );
    } finally {
      console.log = originalLog;
    }

    expect(logs).toContain("\n## Findings\n\nSomething worth reading.\n");
  });

  test("renders result details when stdout is interactive", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await executeWorkflow(
        async () => ({
          summary: "Review complete",
          details: "## Findings\n\nSomething worth reading.",
        }),
        f,
        { terminal: { isTTY: true, columns: 80 } },
      );
    } finally {
      console.log = originalLog;
    }

    const details = logs.find((line) => line.includes("Findings"));
    expect(details).toBeDefined();
    expect(details).toContain("\x1b[");
    expect(Bun.stripANSI(details ?? "")).not.toContain("##");
  });

  test("emits only the execution document to stdout in JSON mode", async () => {
    const markdown = "## Details\n\n**Still raw.**";
    const output: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => output.push(message);
    console.error = (message: string) => errors.push(message);

    try {
      await executeWorkflow(
        async () => ({
          summary: "Done",
          details: markdown,
          outputs: { count: 2 },
        }),
        f,
        { json: true, terminal: { isTTY: true, columns: 80 } },
      );
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      error: null,
      result: { summary: "Done", details: markdown, outputs: { count: 2 } },
    });
    expect(output[0]).not.toContain("\x1b[");
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
      }, f);
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
      }, f);
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
      await executeWorkflow(async () => undefined, f);
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
      }, f);
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
      }, f);
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
      await executeWorkflow(async () => undefined, f);
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
      }, f);
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

describe("formatWorkflowDetails", () => {
  test("renders Markdown for an interactive terminal", () => {
    const formatted = formatWorkflowDetails("## Findings\n\n**Important**", {
      isTTY: true,
      columns: 80,
    });

    expect(formatted).toContain("\x1b[");
    expect(Bun.stripANSI(formatted)).not.toContain("##");
    expect(Bun.stripANSI(formatted)).not.toContain("**");
  });

  test("preserves Markdown for redirected output", () => {
    expect(
      formatWorkflowDetails("## Findings\n\n**Important**", {
        isTTY: false,
        columns: 80,
      }),
    ).toBe("## Findings\n\n**Important**");
  });
});

describe("shouldUseTui", () => {
  const interactive = { stdinIsTTY: true, stdoutIsTTY: true };

  test("uses the TUI for an interactive terminal", () => {
    expect(shouldUseTui(["workflow.ts"], interactive)).toBe(true);
  });

  test("uses logs for redirected input or output", () => {
    expect(
      shouldUseTui(["workflow.ts"], {
        stdinIsTTY: false,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldUseTui(["workflow.ts"], {
        stdinIsTTY: true,
        stdoutIsTTY: false,
      }),
    ).toBe(false);
  });

  test("allows log, verbose, and JSON modes to override an interactive terminal", () => {
    expect(shouldUseTui(["workflow.ts", "--log"], interactive)).toBe(false);
    expect(shouldUseTui(["workflow.ts", "--verbose"], interactive)).toBe(false);
    expect(shouldUseTui(["workflow.ts", "-v"], interactive)).toBe(false);
    expect(shouldUseTui(["workflow.ts", "--json"], interactive)).toBe(false);
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
    expect(formatDuration(59_949)).toBe("59.9s");
    expect(formatDuration(59_950)).toBe("1m");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(61_000)).toBe("1m1s");
    expect(formatDuration(125_000)).toBe("2m5s");
  });

  test("formats durations in hours, minutes, and seconds", () => {
    expect(formatDuration(3_599_600)).toBe("1h");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_660_000)).toBe("1h1m");
    expect(formatDuration(3_661_000)).toBe("1h1m1s");
    expect(formatDuration(7_385_000)).toBe("2h3m5s");
  });
});
