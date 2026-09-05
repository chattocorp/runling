import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ShellCommand, ShellError } from "./shell.ts";
import { observeFactoryEvents, type FactoryEvent } from "./events.ts";
import { log } from "./log.ts";
import { createShell } from "./shell.ts";

afterEach(() => vi.restoreAllMocks());

describe("createShell", () => {
  test("quotes interpolations without executing shell expressions", async () => {
    const value =
      "it's $(printf injected) `printf injected` ; echo injected\n$HOME";
    expect(await createShell()`printf %s ${value}`.text()).toBe(value);
    expect(
      await createShell()`printf '%s|' ${["one two", "three'four", ""]}`.text(),
    ).toBe("one two|three'four||");
  });

  test("throws buffered failures and executes each command only once", async () => {
    const events: FactoryEvent[] = [];
    await observeFactoryEvents(
      (event) => events.push(event),
      async () => {
        const command = createShell()`printf failure >&2; exit 7`;
        await expect(command).rejects.toBeInstanceOf(ShellError);
        await expect(command).rejects.toMatchObject({
          exitCode: 7,
          stderr: Buffer.from("failure"),
        });
      },
    );
    expect(
      events.filter((event) => event.type === "command.finished"),
    ).toHaveLength(1);
  });
  test("logs the escaped command it runs", async () => {
    const info = vi.spyOn(log, "info");

    await createShell()`echo ${"hello world"}`;

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain("Running");
    expect(info.mock.calls[0]?.[0]).toContain("echo 'hello world'");
  });

  test("truncates long command previews without changing the command", async () => {
    const info = vi.spyOn(log, "info");
    const value = `${"x".repeat(500)}the-end`;

    const output = await createShell()`printf %s ${value}`.text();

    const message = info.mock.calls[0]?.[0] ?? "";
    expect(output).toBe(value);
    expect(message).toContain("characters omitted");
    expect(message).not.toContain("the-end");
    expect(stripVTControlCharacters(message).length).toBeLessThan(240);
  });

  test("creates quiet commands by default", async () => {
    const quiet = vi.spyOn(ShellCommand.prototype, "quiet");

    await createShell()`true`;

    expect(quiet).toHaveBeenCalledWith(true);
  });

  test("creates streaming commands in verbose mode", async () => {
    const quiet = vi.spyOn(ShellCommand.prototype, "quiet");

    await createShell({ verbose: true })`true`;

    expect(quiet).toHaveBeenCalledWith(false);
  });

  test("reports the command lifecycle under the current activity", async () => {
    const events: FactoryEvent[] = [];

    await observeFactoryEvents(
      (event) => events.push(event),
      () => createShell()`true`,
    );
    await Promise.resolve();

    const started = events.find((event) => event.type === "command.started");
    const finished = events.find((event) => event.type === "command.finished");
    expect(started).toMatchObject({
      type: "command.started",
      command: "true",
    });
    expect(finished).toMatchObject({
      type: "command.finished",
      id: started?.id,
      status: "completed",
      output: { stdout: "", stderr: "" },
    });
  });

  test("captures output from failed commands in their lifecycle event", async () => {
    const events: FactoryEvent[] = [];

    await observeFactoryEvents(
      (event) => events.push(event),
      () =>
        createShell()`${process.execPath} -e ${"console.log('stdout'); console.error('stderr'); process.exit(3)"}`.nothrow(),
    );
    await Promise.resolve();

    const finished = events.find((event) => event.type === "command.finished");
    expect(finished).toMatchObject({
      type: "command.finished",
      status: "failed",
      output: {
        stdout: "stdout\n",
        stderr: "stderr\n",
      },
    });
  });

  test("uses the calling context's cwd by default", async () => {
    const cwd = vi.spyOn(ShellCommand.prototype, "cwd");
    const shell = createShell();
    const context = { cwd: process.cwd(), shell };

    await context.shell`true`;

    expect(cwd).toHaveBeenCalledWith(process.cwd());
  });

  test("allows an explicit default cwd", async () => {
    const cwd = vi.spyOn(ShellCommand.prototype, "cwd");

    await createShell({ cwd: process.cwd() })`true`;

    expect(cwd).toHaveBeenCalledWith(process.cwd());
  });
});
