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
      "Usage: factory [-v|--verbose] <workflow.ts> <prompt>",
    );
    expect(stderr).not.toContain("at ");
  });
});
