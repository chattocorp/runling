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

const { runAgent } = await import("./agent.ts");

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
