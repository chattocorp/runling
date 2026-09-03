import { describe, expect, test } from "bun:test";
import { type Factory, type Shell } from "../src/index.ts";
import { implement } from "./implement.ts";

const contextValues = {
  cwd: "/project",
  prompt: "Make the change",
  verbose: false,
};

const completedReport = {
  outcome: "completed" as const,
  summary: "Made the change",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

interface RuntimeOptions {
  runCheck?: () => Promise<void>;
  runTests?: () => Promise<void>;
  runAgent?: (
    prompt: string,
    options?: Record<string, unknown>,
  ) => Promise<typeof completedReport>;
}

function runtimeWith({
  runCheck = async () => {},
  runTests = async () => {},
  runAgent = async () => completedReport,
}: RuntimeOptions = {}) {
  const messages: string[] = [];
  const agentOptions: Record<string, unknown>[] = [];
  let disposedAgents = 0;
  class TestShellError extends Error {
    stdout = Buffer.from("stdout");
    stderr = Buffer.from("stderr");
  }
  const shell = ((strings: TemplateStringsArray) => {
    const command = strings.join("");
    const run = command === "bun run check" ? runCheck : runTests;
    const shellPromise = {
      cwd: () => shellPromise,
      async nothrow() {
        try {
          await run();
          return {
            exitCode: 0,
            stdout: Buffer.from(""),
            stderr: Buffer.from(""),
          };
        } catch (error) {
          if (!(error instanceof TestShellError)) throw error;
          return {
            exitCode: 1,
            stdout: error.stdout,
            stderr: error.stderr,
          };
        }
      },
    };
    return shellPromise;
  }) as unknown as Shell;

  const factory = {
    ...contextValues,
    shell,
    agent: async (options: Record<string, unknown>) => {
      agentOptions.push(options);
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        disposedAgents++;
      };
      return {
        id: "test-agent-0000",
        run: (prompt: string) => runAgent(prompt, options),
        dispose,
        async [Symbol.asyncDispose]() {
          dispose();
        },
      };
    },
    concat: (...parts: string[]) => parts.join("\n"),
    createShell: () => shell,
    getPwd: async () => ({ hasChanges: Promise.resolve(true) }),
    log: { info: (message: string) => messages.push(message) },
    ShellError: TestShellError,
  } as unknown as Factory;

  return {
    factory,
    messages,
    agentOptions,
    get disposedAgents() {
      return disposedAgents;
    },
    TestShellError,
  };
}

describe("implement workflow", () => {
  test("runs agents on Sol with medium thinking", async () => {
    const setup = runtimeWith();

    await expect(implement(setup.factory)).resolves.toBe("Made the change");

    expect(setup.agentOptions).toHaveLength(1);
    expect(setup.disposedAgents).toBe(1);
    expect(setup.agentOptions[0]).toMatchObject({
      cwd: "/project",
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      instructions: ["Write tests for new or changed features."],
    });
  });

  test("runs repair agents on the same model and thinking level", async () => {
    let checks = 0;
    let TestShellError: new () => Error;
    const setup = runtimeWith({
      runCheck: async () => {
        checks++;
        if (checks === 1) {
          throw new TestShellError();
        }
      },
    });
    TestShellError = setup.TestShellError;

    await expect(implement(setup.factory)).resolves.toBe("Made the change");

    expect(setup.agentOptions).toHaveLength(2);
    expect(setup.disposedAgents).toBe(2);
    expect(setup.agentOptions[1]).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
    });
  });

  test("runs checks and tests once when both pass", async () => {
    let checks = 0;
    let tests = 0;
    const { factory, messages } = runtimeWith({
      runCheck: async () => {
        checks++;
      },
      runTests: async () => {
        tests++;
      },
    });

    await expect(implement(factory)).resolves.toBe("Made the change");

    expect(checks).toBe(1);
    expect(tests).toBe(1);
    expect(messages).toEqual([
      "Running checks (attempt 1/3)",
      "Running tests (attempt 1/3)",
    ]);
  });

  test("awaits a repair before rerunning checks and tests", async () => {
    let tests = 0;
    let repaired = false;
    let TestShellError: new () => Error;
    const setup = runtimeWith({
      runTests: async () => {
        tests++;
        if (tests === 1) {
          throw new TestShellError();
        }
        expect(repaired).toBe(true);
      },
      runAgent: async () => {
        if (tests > 0) {
          await Promise.resolve();
          repaired = true;
        }
        return completedReport;
      },
    });
    TestShellError = setup.TestShellError;

    await expect(implement(setup.factory)).resolves.toBe("Made the change");

    expect(tests).toBe(2);
    expect(setup.messages).toEqual([
      "Running checks (attempt 1/3)",
      "Running tests (attempt 1/3)",
      "Fixing failed validation (attempt 1/3)",
      "Running checks (attempt 2/3)",
      "Running tests (attempt 2/3)",
    ]);
  });
});
