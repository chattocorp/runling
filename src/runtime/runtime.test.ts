import { describe, expect, test } from "vitest";
import { createRunling } from "./runtime.ts";

describe("runling", () => {
  test("combines primitives and invocation state", () => {
    const f = createRunling({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
    });

    expect(f.agent).toBeTypeOf("function");
    expect(f.input).toBeTypeOf("function");
    expect(f.shell).toBeTypeOf("function");
    expect(f.exec).toBeTypeOf("function");
    expect(f).not.toHaveProperty("createExec");
    expect(f).not.toHaveProperty("createShell");
    expect(f).not.toHaveProperty("concat");
    expect(f).not.toHaveProperty("randomId");
    expect(f).not.toHaveProperty("CommandError");
    expect(f).not.toHaveProperty("ShellError");
    expect(f).not.toHaveProperty("AgentOutcomeError");
    expect(f.cwd).toBe("/project");
    expect(f.prompt).toBe("Make the change");
  });

  test("is a plain object that can be copied with selected state overridden", () => {
    const f = createRunling({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
    });

    const derived = { ...f, cwd: "/worktree" };

    expect(derived).not.toBe(f);
    expect(derived.cwd).toBe("/worktree");
    expect(derived.prompt).toBe(f.prompt);
    expect(derived.agent).toBe(f.agent);
    expect(f.cwd).toBe("/project");
  });

  test("delegates workflow input to its host callback", async () => {
    const f = createRunling({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
      handleInput: async ({ message }) => `Answered: ${message}`,
    });

    await expect(f.input("What now?")).resolves.toBe("Answered: What now?");
  });
});
