import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { $ } from "bun";
import { observeFactoryEvents, type FactoryEvent } from "./events.ts";
import { log } from "./log.ts";
import { createShell } from "./shell.ts";

afterEach(() => mock.restore());

describe("createShell", () => {
  test("logs the escaped command it runs", async () => {
    const info = spyOn(log, "info");

    await createShell()`echo ${"hello world"}`;

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain("Running");
    expect(info.mock.calls[0]?.[0]).toContain('echo "hello world"');
  });

  test("truncates long command previews without changing the command", async () => {
    const info = spyOn(log, "info");
    const value = `${"x".repeat(500)}the-end`;

    const output = await createShell()`printf %s ${value}`.text();

    const message = info.mock.calls[0]?.[0] ?? "";
    expect(output).toBe(value);
    expect(message).toContain("characters omitted");
    expect(message).not.toContain("the-end");
    expect(message.length).toBeLessThan(260);
  });

  test("creates quiet commands by default", async () => {
    const quiet = spyOn($.ShellPromise.prototype, "quiet");

    await createShell()`true`;

    expect(quiet).toHaveBeenCalledWith(true);
  });

  test("creates streaming commands in verbose mode", async () => {
    const quiet = spyOn($.ShellPromise.prototype, "quiet");

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
    });
  });

  test("uses the calling context's cwd by default", async () => {
    const cwd = spyOn($.ShellPromise.prototype, "cwd");
    const shell = createShell();
    const context = { cwd: process.cwd(), shell };

    await context.shell`true`;

    expect(cwd).toHaveBeenCalledWith(process.cwd());
  });

  test("allows an explicit default cwd", async () => {
    const cwd = spyOn($.ShellPromise.prototype, "cwd");

    await createShell({ cwd: process.cwd() })`true`;

    expect(cwd).toHaveBeenCalledWith(process.cwd());
  });
});
