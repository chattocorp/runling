import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const executable = resolve(import.meta.dir, "factory.ts");
const fixture = resolve(import.meta.dir, "../test/fixtures/echo-workflow.ts");

describe("factory executable", () => {
  test("loads a workflow file and injects the factory runtime", async () => {
    const child = Bun.spawn(
      [process.execPath, executable, fixture, "A workflow result"],
      {
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("A workflow result");
    expect(stdout).toContain("Finished in ");
  });

  test("reports invalid invocations without a stack trace", async () => {
    const child = Bun.spawn([process.execPath, executable], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      "Usage: factory [-v|--verbose] [--json] <workflow.ts> <prompt>",
    );
    expect(stderr).not.toContain("at ");
  });

  test("prints one structured document to stdout in JSON mode", async () => {
    const child = Bun.spawn(
      [process.execPath, executable, fixture, "--json", "A JSON result"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    const execution = JSON.parse(stdout);
    expect(execution.ok).toBe(true);
    expect(execution.error).toBeNull();
    expect(execution.result.summary).toBe("A JSON result");
    expect(execution.result.outputs.id).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
    expect(execution.durationMs).toBeNumber();
    expect(execution.usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(stderr).toContain("Factory starting");
    expect(stderr).toContain("Finished in ");
  });

  test("reports failures as JSON with a nonzero exit status", async () => {
    const child = Bun.spawn([process.execPath, executable, "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      result: null,
      error: "Usage: factory [-v|--verbose] [--json] <workflow.ts> <prompt>",
    });
    expect(stderr).toContain("Usage: factory");
  });
});
