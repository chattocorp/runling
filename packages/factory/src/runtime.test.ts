import { describe, expect, test } from "vitest";
import { createFactory } from "./runtime.ts";

describe("factory", () => {
  test("combines primitives and invocation state", () => {
    const f = createFactory({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
    });

    expect(f.agent).toBeTypeOf("function");
    expect(f.input).toBeTypeOf("function");
    expect(f.shell).toBeTypeOf("function");
    expect(f.createShell).toBeTypeOf("function");
    expect(f.cwd).toBe("/project");
    expect(f.prompt).toBe("Make the change");
  });

  test("is a plain object that can be copied with selected state overridden", () => {
    const f = createFactory({
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
    const f = createFactory({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
      handleInput: async ({ message }) => `Answered: ${message}`,
    });

    await expect(f.input("What now?")).resolves.toBe("Answered: What now?");
  });
});
