import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const fakeModel = {
  id: "claude-opus-4-5",
  name: "Claude Opus 4.5",
  provider: "anthropic",
};

const emptyUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

let eventHandler: ((event: any) => void) | undefined;
let promptImplementation: ((prompt: string) => Promise<void>) | undefined;
let sessionOptions: any;
let resourceOptions: any;
let settingsCreateArgs: unknown[] | undefined;
let settingsOverrides: any;
let promptCalls = 0;
let sessionCreations = 0;
let abortCalls = 0;
let disposed = false;
let modelAvailable = true;

mock.module("@earendil-works/pi-coding-agent", () => {
  return {
    ModelRuntime: {
      create: async () => ({
        getModel: () => (modelAvailable ? fakeModel : undefined),
      }),
    },
    DefaultResourceLoader: class {
      constructor(options: unknown) {
        resourceOptions = options;
      }
      async reload() {}
    },
    getAgentDir: () => "/tmp/agent-dir",
    SettingsManager: {
      create: (...args: unknown[]) => {
        settingsCreateArgs = args;
        return {
          getRetrySettings: () => ({
            enabled: true,
            maxRetries: 3,
            baseDelayMs: 2000,
          }),
          applyOverrides: (overrides: unknown) => {
            settingsOverrides = overrides;
          },
        };
      },
    },
    SessionManager: {
      inMemory: () => ({}),
    },
    createAgentSession: async (options: unknown) => {
      sessionCreations++;
      sessionOptions = options;
      const session = {
        subscribe(handler: (event: any) => void) {
          eventHandler = handler;
          return () => {
            if (eventHandler === handler) eventHandler = undefined;
          };
        },
        prompt: async (prompt: string) => {
          promptCalls++;
          await promptImplementation?.(prompt);
        },
        abort: async () => {
          abortCalls++;
        },
        dispose: () => {
          disposed = true;
        },
      };
      return { session };
    },
    defineTool: (tool: unknown) => tool,
  };
});

const {
  agent,
  AgentOutcomeError,
  describeTool,
  runAgent,
} = await import("./agent.ts");
const { getRecordedTokenUsage, resetTokenUsage } = await import("./usage.ts");
const { log } = await import("./log.ts");

beforeEach(() => {
  eventHandler = undefined;
  promptImplementation = undefined;
  sessionOptions = undefined;
  resourceOptions = undefined;
  settingsCreateArgs = undefined;
  settingsOverrides = undefined;
  promptCalls = 0;
  sessionCreations = 0;
  abortCalls = 0;
  disposed = false;
  modelAvailable = true;
  resetTokenUsage();
});

async function reportOutcome(report: {
  outcome: "completed" | "blocked" | "failed";
  summary: string;
}) {
  await sessionOptions.customTools[0].execute("tool-call", report);
}

function emitAssistantText(text: string) {
  eventHandler?.({
    type: "message_end",
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function emitAssistantUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  eventHandler?.({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      usage,
    },
  });
}

describe("describeTool", () => {
  test("describes known tools", () => {
    expect(describeTool("read", { path: "src/foo.ts" })).toBe(
      "Reading src/foo.ts",
    );
    expect(describeTool("edit", { path: "src/foo.ts" })).toBe(
      "Editing src/foo.ts",
    );
    expect(describeTool("write", { path: "src/foo.ts" })).toBe(
      "Writing src/foo.ts",
    );
    expect(describeTool("bash", { command: "bun test" })).toBe(
      "Running bun test",
    );
    expect(describeTool("report_outcome", {})).toBe("Using report_outcome");
  });

  test("falls back to a generic message for unknown tools", () => {
    expect(describeTool("grep", { pattern: "foo" })).toBe("Using grep");
  });
});

describe("runAgent", () => {
  test("uses a distinct, consistent color for each agent", async () => {
    const withColor = spyOn(log, "withColor");
    const colorize = spyOn(log, "colorize");
    promptImplementation = async () => {
      eventHandler?.({ type: "agent_start" });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await runAgent("Do the first thing", {
        model: "anthropic/claude-opus-4-5",
      });
      const firstAgentColors = withColor.mock.calls.map((call) => call[0]);
      withColor.mockClear();

      await runAgent("Do the second thing", {
        model: "anthropic/claude-opus-4-5",
      });

      const secondAgentColors = withColor.mock.calls.map((call) => call[0]);
      expect(new Set(firstAgentColors).size).toBe(1);
      expect(new Set(secondAgentColors).size).toBe(1);
      expect(firstAgentColors[0]).not.toBe(secondAgentColors[0]);
      expect(colorize).toHaveBeenCalled();
      expect(
        colorize.mock.calls.every((call) =>
          /^\[[a-z]+-[a-z]+-\d{4}\]$/.test(call[0]),
        ),
      ).toBe(true);
    } finally {
      colorize.mockRestore();
      withColor.mockRestore();
    }
  });

  test("logs agent events without adding another step or indentation", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);
    promptImplementation = async () => {
      eventHandler?.({ type: "agent_start" });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });
    } finally {
      console.log = originalLog;
    }

    const started = logs.find((line) => line.includes("Agent started"));

    expect(
      logs.some((line) => /Agent [a-z]+-[a-z]+-\d{4}$/.test(line)),
    ).toBe(false);
    expect(started).toBeDefined();
    expect(started).not.toMatch(/^\s/);
  });

  test("prefixes every log line with one human-friendly agent ID", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => logs.push(message);
    console.error = (message: string) => errors.push(message);
    promptImplementation = async () => {
      eventHandler?.({ type: "agent_start" });
      eventHandler?.({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "src/foo.ts" },
      });
      eventHandler?.({
        type: "tool_execution_end",
        toolName: "bash",
        isError: true,
      });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const plainLogs = logs.map(stripAnsi);
    const plainErrors = errors.map(stripAnsi);
    const id = plainLogs
      .find((line) => line.includes("Agent started"))
      ?.match(/\[([a-z]+-[a-z]+-\d{4})\]/)?.[1];

    expect(id).toBeDefined();
    expect(
      plainLogs.some((line) => line.includes(`[${id}] Agent started`)),
    ).toBe(true);
    expect(
      plainLogs.some((line) => line.includes(`[${id}] Reading src/foo.ts`)),
    ).toBe(true);
    const reading = logs.find(
      (line) => line.includes("Reading") && line.includes("src/foo.ts"),
    );
    expect(reading).toBeDefined();
    expect(reading).toContain("\x1b[1m");
    expect(reading).toContain(Bun.color("#40c057", "ansi") ?? "");
    expect(reading!.indexOf("\x1b[0m", reading!.indexOf("Reading"))).toBeLessThan(
      reading!.indexOf("src/foo.ts"),
    );
    expect(
      plainErrors.some((line) => line.includes(`[${id}] bash failed`)),
    ).toBe(true);
  });

  test("logs automatic retry progress", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => logs.push(stripAnsi(message));
    console.error = (message: string) => errors.push(stripAnsi(message));
    promptImplementation = async () => {
      eventHandler?.({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 5,
        delayMs: 2000,
        errorMessage: "fetch failed\nwhile streaming",
      });
      eventHandler?.({ type: "auto_retry_end", success: true, attempt: 1 });
      eventHandler?.({
        type: "auto_retry_end",
        success: false,
        attempt: 5,
        finalError: "connection lost",
      });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(
      logs.some((line) =>
        line.includes(
          "Retrying agent in 2s (attempt 1/5): fetch failed while streaming",
        ),
      ),
    ).toBe(true);
    expect(
      logs.some((line) =>
        line.includes("Agent recovered after 1 retry attempt"),
      ),
    ).toBe(true);
    expect(
      errors.some((line) =>
        line.includes(
          "Agent retry failed after 5 retry attempts: connection lost",
        ),
      ),
    ).toBe(true);
  });

  test("raises Pi's agent retry budget to at least five", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    await runAgent("Do the thing", {
      model: "anthropic/claude-opus-4-5",
      cwd: "/tmp/project",
      resources: { agentDir: "/tmp/custom-agent" },
    });

    expect(settingsCreateArgs).toEqual(["/tmp/project", "/tmp/custom-agent"]);
    expect(settingsOverrides).toEqual({
      retry: { enabled: true, maxRetries: 5, baseDelayMs: 2000 },
    });
    expect(resourceOptions.settingsManager).toBe(sessionOptions.settingsManager);
  });

  test("returns the structured outcome reported by the agent", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "blocked", summary: "Need access" });
    };

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).resolves.toEqual({
      outcome: "blocked",
      summary: "Need access",
      usage: emptyUsage,
    });
    expect(disposed).toBe(true);
  });

  test("does not treat an unreported plain-text response as success", async () => {
    promptImplementation = async () => emitAssistantText("I could not finish");

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).resolves.toEqual({
      outcome: "failed",
      summary: "Agent finished without a valid outcome report",
      usage: emptyUsage,
    });
    expect(promptCalls).toBe(2);
  });

  test("recovers a malformed tool call with one corrective turn", async () => {
    promptImplementation = async () => {
      if (promptCalls === 1) {
        emitAssistantText('functions.report_outcome:0{"outcome":"completed"}');
      } else {
        await reportOutcome({ outcome: "completed", summary: "Done" });
      }
    };

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).resolves.toEqual({
      outcome: "completed",
      summary: "Done",
      usage: emptyUsage,
    });
    expect(promptCalls).toBe(2);
  });

  test("returns and logs accumulated token usage including cached tokens", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);
    promptImplementation = async () => {
      emitAssistantUsage({ input: 100, output: 20, cacheRead: 500, cacheWrite: 10 });
      emitAssistantUsage({ input: 50, output: 25, cacheRead: 550, cacheWrite: 15 });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await expect(
        runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
      ).resolves.toEqual({
        outcome: "completed",
        summary: "Done",
        usage: {
          input: 150,
          output: 45,
          cacheRead: 1050,
          cacheWrite: 25,
        },
      });
    } finally {
      console.log = originalLog;
    }

    expect(
      logs.some((line) =>
        line.includes(
          "Token usage: in 150, out 45, cache read 1,050, cache write 25",
        ),
      ),
    ).toBe(true);
  });

  test("records usage into the workflow-wide totals", async () => {
    promptImplementation = async () => {
      emitAssistantUsage({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });

    expect(getRecordedTokenUsage()).toEqual({
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  test("returns token usage even when no outcome is reported", async () => {
    promptImplementation = async () => {
      if (promptCalls === 1) {
        emitAssistantUsage({ input: 7, output: 3, cacheRead: 0, cacheWrite: 0 });
        emitAssistantText("I could not finish");
      }
    };

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).resolves.toEqual({
      outcome: "failed",
      summary: "Agent finished without a valid outcome report",
      usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0 },
    });
  });

  test("disposes the session when prompting fails", async () => {
    promptImplementation = async () => {
      throw new Error("Provider unavailable");
    };

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).rejects.toThrow("Provider unavailable");
    expect(disposed).toBe(true);
  });

  test("records usage when prompting fails", async () => {
    promptImplementation = async () => {
      emitAssistantUsage({ input: 10, output: 5, cacheRead: 20, cacheWrite: 1 });
      throw new Error("Provider unavailable");
    };

    await expect(
      runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).rejects.toThrow("Provider unavailable");
    expect(getRecordedTokenUsage()).toEqual({
      input: 10,
      output: 5,
      cacheRead: 20,
      cacheWrite: 1,
    });
  });

  test("rejects unavailable models before creating a session", async () => {
    modelAvailable = false;

    await expect(
      runAgent("Do the thing", { model: "anthropic/missing" }),
    ).rejects.toThrow("Model anthropic/missing is unavailable");
    expect(sessionOptions).toBeUndefined();
  });

  test("forwards the requested thinking level to the session", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    await runAgent("Do the thing", {
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
    });

    expect(sessionOptions.thinkingLevel).toBe("medium");
  });

  test("leaves the thinking level to pi defaults when unspecified", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });

    expect(sessionOptions.thinkingLevel).toBeUndefined();
  });

  test("applies execution and resource boundaries", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Reviewed" });
    };

    await runAgent("Review", {
      model: "anthropic/claude-opus-4-5",
      cwd: "/tmp/project",
      tools: ["read"],
      resources: {
        agentDir: "/tmp/agent",
        extensions: false,
        skills: false,
        promptTemplates: false,
        themes: false,
        contextFiles: false,
      },
    });

    expect(sessionOptions.cwd).toBe("/tmp/project");
    expect(sessionOptions.tools).toEqual(["read", "report_outcome"]);
    expect(resourceOptions).toMatchObject({
      cwd: "/tmp/project",
      agentDir: "/tmp/agent",
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    expect(resourceOptions.appendSystemPromptOverride(["Base prompt"])).toEqual([
      "Base prompt",
      expect.stringContaining("non-interactive software factory"),
    ]);
  });

  test("instructs agents to report in Esperanto in Esperanto mode", async () => {
    await log.withLanguage("esperanto", () =>
      runAgent("Reviziu", {
        model: "anthropic/claude-opus-4-5",
      }),
    );

    expect(resourceOptions.appendSystemPromptOverride(["Baza peto"])).toEqual([
      "Baza peto",
      expect.stringContaining("non-interactive software factory"),
      expect.stringContaining("in Esperanto"),
    ]);
  });

  test("aborts and disposes an active session", async () => {
    const controller = new AbortController();
    promptImplementation = async () => controller.abort("Stopped");

    await expect(
      runAgent("Do the thing", {
        model: "anthropic/claude-opus-4-5",
        signal: controller.signal,
      }),
    ).rejects.toBe("Stopped");
    expect(abortCalls).toBe(1);
    expect(disposed).toBe(true);
  });
});

describe("agent", () => {
  test("retains one session across sequential runs", async () => {
    promptImplementation = async (prompt) => {
      await reportOutcome({ outcome: "completed", summary: prompt });
    };
    const instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });

    try {
      expect(instance.id).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
      await expect(instance.run("Investigate")).resolves.toMatchObject({
        outcome: "completed",
        summary: "Investigate",
      });
      await expect(instance.run("Implement")).resolves.toMatchObject({
        outcome: "completed",
        summary: "Implement",
      });

      expect(sessionCreations).toBe(1);
      expect(promptCalls).toBe(2);
      expect(disposed).toBe(false);
    } finally {
      instance.dispose();
    }

    expect(disposed).toBe(true);
  });

  test("uses fresh outcome state for every run", async () => {
    promptImplementation = async (prompt) => {
      await reportOutcome(
        prompt === "First"
          ? { outcome: "completed", summary: "First result" }
          : { outcome: "blocked", summary: "Second result" },
      );
    };
    const instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });

    try {
      await expect(instance.run("First")).resolves.toMatchObject({
        outcome: "completed",
        summary: "First result",
      });
      await expect(instance.runOutcome("Second")).resolves.toMatchObject({
        outcome: "blocked",
        summary: "Second result",
      });
    } finally {
      instance.dispose();
    }
  });

  test("rejects concurrent runs", async () => {
    let release: (() => void) | undefined;
    promptImplementation = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };
    const instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });

    try {
      const first = instance.run("First");
      await expect(instance.run("Second")).rejects.toThrow("already running");
      release?.();
      await first;
    } finally {
      instance.dispose();
    }
  });

  test("rejects runs after disposal", async () => {
    const instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });
    instance.dispose();

    await expect(instance.run("Too late")).rejects.toThrow("has been disposed");
  });

  test("can run again after an aborted turn", async () => {
    const controller = new AbortController();
    promptImplementation = async () => controller.abort("Stopped");
    const instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });

    try {
      await expect(
        instance.run("First", { signal: controller.signal }),
      ).rejects.toBe("Stopped");
      expect(disposed).toBe(false);

      promptImplementation = async () => {
        await reportOutcome({ outcome: "completed", summary: "Recovered" });
      };
      await expect(instance.run("Second")).resolves.toMatchObject({
        outcome: "completed",
        summary: "Recovered",
      });
    } finally {
      instance.dispose();
    }
  });

  test("supports automatic disposal", async () => {
    {
      await using instance = await agent({
        model: "anthropic/claude-opus-4-5",
      });
      expect(disposed).toBe(false);
      expect(instance.id).toBeString();
    }

    expect(disposed).toBe(true);
  });

  test("throws unsuccessful outcomes while preserving their report", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "blocked", summary: "Need input" });
    };
    await using instance = await agent({
      model: "anthropic/claude-opus-4-5",
    });

    try {
      await instance.run("Do the thing");
      throw new Error("Expected run to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentOutcomeError);
      expect((error as Error).message).toBe("Need input");
      expect((error as { report: unknown }).report).toEqual({
        outcome: "blocked",
        summary: "Need input",
        usage: emptyUsage,
      });
    }
  });
});
