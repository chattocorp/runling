import { describe, expect, test } from "bun:test";
import { cli } from "./cli.ts";
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

  test("reports missing prompts", () => {
    try {
      cli([]);
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Usage: bun workflow.ts [-v|--verbose] <prompt>",
      );
    }
  });

  test("rejects silently truncated prompts", () => {
    expect(() => cli(["make", "the change"])).toThrow(
      "The prompt must be passed as a single quoted argument",
    );
  });

  test("reports invalid options", () => {
    try {
      cli(["--unknown", "make the change"]);
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(String(error)).toContain("Unknown option");
    }
  });
});
