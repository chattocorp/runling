import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import {
  executeWorkflow,
  formatDuration,
  formatWorkflowDetails,
  normalizeWorkflowResult,
  runWorkflow,
  shouldUseTui,
} from "./runner.ts";
import type { FactoryEvent } from "./events.ts";
import type { InputRequest } from "./input.ts";
import { createFactory } from "./runtime.ts";
import { recordTokenUsage, resetTokenUsage } from "./usage.ts";
import { Type } from "typebox";
import { workflow } from "./workflow.ts";

const initialExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = initialExitCode ?? 0;
  resetTokenUsage();
});

describe("executeWorkflow", () => {
  const f = createFactory({
    cwd: "/project",
    prompt: "Make the change",
    verbose: false,
  });

  test("passes one factory containing primitives and invocation values", async () => {
    await executeWorkflow(async (receivedFactory) => {
      expect(receivedFactory).toBe(f);
      expect(receivedFactory.agent).toBeTypeOf("function");
      expect(receivedFactory.shell).toBeTypeOf("function");
      expect(receivedFactory.createShell).toBeTypeOf("function");
      expect(receivedFactory.step).toBeTypeOf("function");
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
    expect(stripVTControlCharacters(details ?? "")).not.toContain("##");
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

describe("runWorkflow", () => {
  test("does not use the removed prompt option as workflow input", async () => {
    let started = false;
    const echo = workflow(
      { name: "Echo", input: Type.String(), output: Type.String() },
      (_f, input) => { started = true; return input; },
    );
    // @ts-expect-error Callers must provide input, not a legacy prompt option.
    const execution = await runWorkflow(echo, { prompt: "Legacy fallback" });
    expect(execution.ok).toBe(false);
    expect(execution.error).toContain('Workflow "Echo" input is invalid');
    expect(started).toBe(false);
    expect(await runWorkflow(echo, { input: "" })).toMatchObject({ ok: true, output: "" });
  });
  test("runs headlessly with host-provided input and event handling", async () => {
    const events: FactoryEvent[] = [];
    const requested = Promise.withResolvers<InputRequest>();
    const answer = Promise.withResolvers<string>();
    const joke = workflow(
      {
        name: "Tell joke",
        input: Type.String(),
        output: Type.String(),
      },
      async (f, input) => {
        expect(f.cwd).toBe("/project");
        expect(f.prompt).toBe("Make me laugh");
        expect(input).toBe("Make me laugh");
        const topic = await f.input("What is the topic?");
        return `A joke about ${topic}`;
      },
    );
    const running = runWorkflow(
      joke,
      {
        cwd: "/project",
        input: "Make me laugh",
        onInput: (request) => {
          requested.resolve(request);
          return answer.promise;
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect((await requested.promise).message).toBe("What is the topic?");
    answer.resolve("robots");
    const execution = await running;

    expect(execution).toMatchObject({
      ok: true,
      error: null,
      output: "A joke about robots",
      result: { summary: "A joke about robots" },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "input.finished",
        status: "answered",
        value: "robots",
      }),
    );
  });

  test("captures failures without changing the process exit code", async () => {
    const exitCode = process.exitCode;
    const failing = workflow(
      { name: "Fail", input: Type.String(), output: Type.String() },
      async () => {
        throw new Error("Nope");
      },
    );
    const execution = await runWorkflow(failing, { input: "" });

    expect(execution).toMatchObject({ ok: false, error: "Nope", result: null });
    expect(process.exitCode).toBe(exitCode);
  });
});

describe("formatWorkflowDetails", () => {
  test("renders Markdown for an interactive terminal", () => {
    const formatted = formatWorkflowDetails("## Findings\n\n**Important**", {
      isTTY: true,
      columns: 80,
    });

    expect(formatted).toContain("\x1b[");
    expect(stripVTControlCharacters(formatted)).not.toContain("##");
    expect(stripVTControlCharacters(formatted)).not.toContain("**");
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
  test("rejects non-JSON values even when a summary is present", () => {
    const circular: Record<string, unknown> = { summary: "Invalid" };
    circular.self = circular;
    for (const output of [
      circular,
      { summary: "Invalid", extra: 1n },
      { summary: "Invalid", extra: () => "value" },
      { values: [undefined] },
    ]) {
      expect(() => normalizeWorkflowResult(output)).toThrow(
        "Workflow output must be valid JSON",
      );
    }
  });

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
    ).toThrow("Workflow output must be valid JSON");
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
