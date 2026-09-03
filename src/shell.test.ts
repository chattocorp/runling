import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { $ } from "bun";
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
});
