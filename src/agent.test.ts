import { beforeEach, describe, expect, mock, test } from "bun:test";

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
let promptCalls = 0;
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
    SessionManager: {
      inMemory: () => ({}),
    },
    createAgentSession: async (options: unknown) => {
      sessionOptions = options;
      const session = {
        subscribe(handler: (event: any) => void) {
          eventHandler = handler;
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
  requireCompletedReport,
  runAgent,
} = await import("./agent.ts");
const { getRecordedTokenUsage, resetTokenUsage } = await import("./usage.ts");

beforeEach(() => {
  eventHandler = undefined;
  promptImplementation = undefined;
  sessionOptions = undefined;
  resourceOptions = undefined;
  promptCalls = 0;
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
  test("indents agent log output under its step label", async () => {
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

    const label = logs.find((line) =>
      /Agent [a-z]+-[a-z]+-\d{4}$/.test(line),
    );
    const started = logs.find((line) => line.includes("Agent started"));

    expect(label).toBeDefined();
    expect(label).not.toMatch(/^\s/);
    expect(started).toBeDefined();
    expect(started).toMatch(/^ {2}/);
  });

  test("prefixes every log line with one human-friendly agent ID", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => logs.push(message);
    console.error = (message: string) => errors.push(message);
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    try {
      await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });

      expect(eventHandler).toBeDefined();
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
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const id = logs
      .find((line) => line.includes("Agent started"))
      ?.match(/\[([a-z]+-[a-z]+-\d{4})\]/)?.[1];

    expect(id).toBeDefined();
    expect(logs.some((line) => line.includes(`[${id}] Agent started`))).toBe(
      true,
    );
    expect(logs.some((line) => line.includes(`[${id}] Reading src/foo.ts`))).toBe(
      true,
    );
    expect(errors.some((line) => line.includes(`[${id}] bash failed`))).toBe(
      true,
    );
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

  test("rejects unavailable models before creating a session", async () => {
    modelAvailable = false;

    await expect(
      runAgent("Do the thing", { model: "anthropic/missing" }),
    ).rejects.toThrow("Model anthropic/missing is unavailable");
    expect(sessionOptions).toBeUndefined();
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
  test("returns completed reports", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "completed", summary: "Done" });
    };

    await expect(
      agent("Do the thing", { model: "anthropic/claude-opus-4-5" }),
    ).resolves.toEqual({
      outcome: "completed",
      summary: "Done",
      usage: emptyUsage,
    });
  });

  test("throws an outcome error for unsuccessful reports", async () => {
    promptImplementation = async () => {
      await reportOutcome({ outcome: "failed", summary: "Could not finish" });
    };

    try {
      await agent("Do the thing", { model: "anthropic/claude-opus-4-5" });
      throw new Error("Expected agent to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentOutcomeError);
      expect((error as InstanceType<typeof AgentOutcomeError>).report.outcome).toBe(
        "failed",
      );
    }
  });
});

describe("requireCompletedReport", () => {
  test("returns completed reports", () => {
    const report = {
      outcome: "completed" as const,
      summary: "Done",
      usage: emptyUsage,
    };
    expect(requireCompletedReport(report)).toBe(report);
  });

  test("rejects unsuccessful reports while preserving their outcome", () => {
    try {
      requireCompletedReport({
        outcome: "blocked",
        summary: "Need input",
        usage: emptyUsage,
      });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Need input");
      expect((error as { report: unknown }).report).toEqual({
        outcome: "blocked",
        summary: "Need input",
        usage: emptyUsage,
      });
    }
  });
});
