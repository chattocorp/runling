import { describe, expect, test } from "bun:test";
import { createFactory } from "./runtime.ts";

describe("factory", () => {
  test("combines primitives and invocation state", () => {
    const f = createFactory({
      cwd: "/project",
      prompt: "Make the change",
      verbose: false,
    });

    expect(f.agent).toBeFunction();
    expect(f.shell).toBeFunction();
    expect(f.createShell).toBeFunction();
    expect(f.cwd).toBe("/project");
    expect(f.prompt).toBe("Make the change");
    expect(f.esperanto).toBe(false);
  });

  test("exposes Esperanto output mode to workflows", () => {
    const f = createFactory({
      cwd: "/project",
      prompt: "Faru la ŝanĝon",
      verbose: false,
      esperanto: true,
    });

    expect(f.esperanto).toBe(true);
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
});
