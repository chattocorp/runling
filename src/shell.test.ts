import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { $ } from "bun";
import { createShell } from "./shell.ts";

afterEach(() => mock.restore());

describe("createShell", () => {
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
