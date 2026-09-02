import { describe, expect, test } from "bun:test";
import { withRetries, type FactoryRuntime, type Shell } from "../src/index.ts";
import { implement } from "./implement.ts";

const invocation = {
  cwd: "/project",
  prompt: "Make the change",
  verbose: false,
};

const completedReport = {
  outcome: "completed" as const,
  summary: "Made the change",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function runtimeWith(
  runCheck: () => Promise<void>,
  runAgent: (prompt: string) => Promise<typeof completedReport> = async () =>
    completedReport,
) {
  const messages: string[] = [];
  const shell = (() => ({ cwd: runCheck })) as unknown as Shell;
  class TestShellError extends Error {
    stdout = Buffer.from("stdout");
    stderr = Buffer.from("stderr");
  }

  const factory = {
    agent: runAgent,
    concat: (...parts: string[]) => parts.join("\n"),
    createShell: () => shell,
    getPwd: async () => ({ hasChanges: Promise.resolve(true) }),
    log: { info: (message: string) => messages.push(message) },
    ShellError: TestShellError,
    withRetries,
  } as unknown as FactoryRuntime;

  return { factory, messages, TestShellError };
}

describe("implement workflow", () => {
  test("stops checking after the first successful attempt", async () => {
    let checks = 0;
    const { factory, messages } = runtimeWith(async () => {
      checks++;
    });

    await expect(implement(factory, invocation)).resolves.toBe(
      "Made the change",
    );

    expect(checks).toBe(1);
    expect(messages).toEqual(["Running tests (attempt 1/3)"]);
  });

  test("awaits a repair before retrying a failed check", async () => {
    let checks = 0;
    let repaired = false;
    let TestShellError: new () => Error;
    const setup = runtimeWith(
      async () => {
        checks++;
        if (checks === 1) {
          throw new TestShellError();
        }
        expect(repaired).toBe(true);
      },
      async () => {
        if (checks > 0) {
          await Promise.resolve();
          repaired = true;
        }
        return completedReport;
      },
    );
    TestShellError = setup.TestShellError;

    await expect(implement(setup.factory, invocation)).resolves.toBe(
      "Made the change",
    );

    expect(checks).toBe(2);
    expect(setup.messages).toEqual([
      "Running tests (attempt 1/3)",
      "Fixing failing tests (attempt 1/3)",
      "Running tests (attempt 2/3)",
    ]);
  });
});
