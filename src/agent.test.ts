import { describe, expect, mock, test } from "bun:test";

const fakeModel = {
  id: "claude-opus-4-5",
  name: "Claude Opus 4.5",
  provider: "anthropic",
};

let agentStartHandler: ((event: { type: string }) => void) | undefined;

mock.module("@earendil-works/pi-coding-agent", () => {
  return {
    ModelRuntime: {
      create: async () => ({
        getModel: () => fakeModel,
      }),
    },
    DefaultResourceLoader: class {
      async reload() {}
    },
    getAgentDir: () => "/tmp/agent-dir",
    SessionManager: {
      inMemory: () => ({}),
    },
    createAgentSession: async () => {
      const session = {
        subscribe(handler: (event: { type: string }) => void) {
          agentStartHandler = handler;
        },
        prompt: async () => {},
        dispose: () => {},
      };
      return { session };
    },
    defineTool: (tool: unknown) => tool,
  };
});

const { describeTool, runAgent } = await import("./agent.ts");

describe("describeTool", () => {
  test("prefixes known tools with their emoji", () => {
    expect(describeTool("read", { path: "src/foo.ts" })).toBe(
      "📖 Reading src/foo.ts",
    );
    expect(describeTool("edit", { path: "src/foo.ts" })).toBe(
      "✏️ Editing src/foo.ts",
    );
    expect(describeTool("write", { path: "src/foo.ts" })).toBe(
      "📝 Writing src/foo.ts",
    );
    expect(describeTool("bash", { command: "bun test" })).toBe(
      "🐚 Running bun test",
    );
    expect(describeTool("report_outcome", {})).toBe("📋 Using report_outcome");
  });

  test("falls back to a wrench for unknown tools", () => {
    expect(describeTool("grep", { pattern: "foo" })).toBe("🔧 Using grep");
  });
});

describe("runAgent", () => {
  test("logs the model when the agent starts", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await runAgent("Do the thing", { model: "anthropic/claude-opus-4-5" });

      expect(agentStartHandler).toBeDefined();
      agentStartHandler?.({ type: "agent_start" });
    } finally {
      console.log = originalLog;
    }

    expect(
      logs.some((line) =>
        line.includes("Agent started (model: anthropic/claude-opus-4-5)"),
      ),
    ).toBe(true);
  });
});
