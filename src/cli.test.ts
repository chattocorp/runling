import { describe, expect, test } from "bun:test";
import { cli } from "./cli.ts";
import { FactoryError } from "./errors.ts";
import { log } from "./log.ts";

describe("cli", () => {
  test("parses a prompt with quiet output by default", () => {
    expect(cli(["make the change"])).toEqual({
      prompt: "make the change",
      verbose: false,
    });
  });

  test("accepts both verbose flags", () => {
    expect(cli(["-v", "make the change"]).verbose).toBe(true);
    expect(log.level).toBe("debug");
    expect(cli(["--verbose", "make the change"]).verbose).toBe(true);
    expect(log.level).toBe("debug");
  });

  test("reports missing prompts as workflow errors", () => {
    expect(() => cli([])).toThrow(FactoryError);
    expect(() => cli([])).toThrow("Usage: bun index.ts");
  });

  test("reports invalid options as workflow errors", () => {
    expect(() => cli(["--unknown", "make the change"])).toThrow(FactoryError);
  });
});
