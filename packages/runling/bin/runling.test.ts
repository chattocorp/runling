import { spawnProcess } from "../../../test/process.ts";
import { describe, expect, test } from "vitest";
import { resolve } from "node:path";

const executable = resolve(import.meta.dirname, "runling.js");
const fixture = resolve(import.meta.dirname, "../test/fixtures/echo-workflow.ts");

describe("runling executable", () => {
  test("loads a workflow file and injects the runling runtime", async () => {
    const child = spawnProcess(
      [process.execPath, executable, fixture, "A workflow result"],
      {
        cwd: import.meta.dirname,
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

  test("runs a workflow without a prompt", async () => {
    const child = spawnProcess(
      [process.execPath, executable, fixture, "--json"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [exitCode, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).result.summary).toBe("");
  });

  test("reports invalid invocations without a stack trace", async () => {
    const child = spawnProcess([process.execPath, executable, "--port", "not-a-port"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Port must be an integer from 1 through 65535");
    expect(stderr).not.toContain("at ");
  });

  test("prints one structured document to stdout in JSON mode", async () => {
    const child = spawnProcess(
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
    expect(execution.durationMs).toBeTypeOf("number");
    expect(execution.usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(stderr).toContain("Runling starting");
    expect(stderr).toContain("Finished in ");
  });

  test("reports failures as JSON with a nonzero exit status", async () => {
    const child = spawnProcess([process.execPath, executable, "--json"], {
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
      error:
        "Usage: runling [-v|--verbose] [--log|--json] <workflow.ts> [prompt]",
    });
    expect(stderr).toContain("Usage: runling");
  });
});
