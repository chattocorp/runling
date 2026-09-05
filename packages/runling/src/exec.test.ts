import { describe, expect, test } from "vitest";
import { createExec, CommandError } from "./shell.ts";
import { createRunling } from "./runtime.ts";
import { observeRunlingEvents, type RunlingEvent } from "./events.ts";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const printArgs = "process.stdout.write(JSON.stringify(process.argv.slice(1)))";

describe("createExec", () => {
  test("passes arguments literally without requiring shell syntax", async () => {
    const values = [
      "a b",
      "it's a quote",
      "$HOME",
      "$(echo injected)",
      ";",
      "|",
      ">",
      "",
      "line\nbreak",
    ];
    expect(
      await createExec()`${process.execPath} -e ${printArgs} ${values}`.json(),
    ).toEqual(values);
  });

  test("joins adjacent interpolations into one argument", async () => {
    expect(
      await createExec()`${process.execPath} -e ${printArgs} refs/${"feature a"}:${"target b"}`.json(),
    ).toEqual(["refs/feature a:target b"]);
  });

  test("preserves output buffers, newlines, and nonzero exit codes", async () => {
    const events: RunlingEvent[] = [];
    const command =
      "console.log('stdout'); console.error('stderr'); process.exit(7)";
    await observeRunlingEvents(
      (event) => events.push(event),
      async () => {
        const result =
          await createExec()`${process.execPath} -e ${command}`.nothrow();
        expect(result).toMatchObject({
          stdout: Buffer.from("stdout\n"),
          stderr: Buffer.from("stderr\n"),
          exitCode: 7,
        });
      },
    );
    expect(
      events.find((event) => event.type === "command.finished"),
    ).toMatchObject({
      status: "failed",
      output: { stdout: "stdout\n", stderr: "stderr\n" },
    });
    await expect(
      createExec()`${process.execPath} -e ${command}`,
    ).rejects.toBeInstanceOf(CommandError);
  });

  test("reports missing executables as failed even in nothrow mode", async () => {
    const events: RunlingEvent[] = [];
    await observeRunlingEvents(
      (event) => events.push(event),
      async () => {
        const result =
          await createExec()`runling-command-that-does-not-exist`.nothrow();
        expect(result.exitCode).not.toBe(0);
      },
    );
    expect(
      events.find((event) => event.type === "command.finished"),
    ).toMatchObject({ status: "failed" });
  });

  test("uses Runling context and allows a per-command cwd override", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "runling-exec-"));
    try {
      const f = createRunling({ cwd, prompt: "", verbose: false });
      const script = "process.stdout.write(process.cwd())";
      expect(
        await realpath(await f.exec`${process.execPath} -e ${script}`.text()),
      ).toBe(await realpath(cwd));
      expect(
        await realpath(
          await f.exec`${process.execPath} -e ${script}`
            .cwd(process.cwd())
            .text(),
        ),
      ).toBe(await realpath(process.cwd()));
      const copy = { ...f, cwd: process.cwd() };
      expect(
        await realpath(
          await copy.exec`${process.execPath} -e ${script}`.text(),
        ),
      ).toBe(await realpath(process.cwd()));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
