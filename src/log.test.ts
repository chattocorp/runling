import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { log } from "./log.ts";

describe("log", () => {
  afterEach(() => {
    mock.restore();
    log.level = "info";
  });

  test("debug does not print at the default info level", () => {
    const print = spyOn(console, "log");
    log.level = "info";

    log.debug("hidden detail");

    expect(print).not.toHaveBeenCalled();
  });

  test("debug prints at the debug level", () => {
    const print = spyOn(console, "log");
    log.level = "debug";

    log.debug("visible detail");

    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0]?.[0]).toContain("visible detail");
  });

  test("info, success, and error print at the info level", () => {
    const print = spyOn(console, "log");
    const printError = spyOn(console, "error");
    log.level = "info";

    log.info("an info message");
    log.success("a success message");
    log.error("an error message");

    expect(print).toHaveBeenCalledTimes(2);
    expect(print.mock.calls[0]?.[0]).toContain("an info message");
    expect(print.mock.calls[1]?.[0]).toContain("a success message");
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0]?.[0]).toContain("an error message");
  });

  test("info, success, and error print at the debug level too", () => {
    const print = spyOn(console, "log");
    log.level = "debug";

    log.info("an info message");
    log.success("a success message");

    expect(print).toHaveBeenCalledTimes(2);
  });
});
