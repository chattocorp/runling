import { describe, expect, test } from "vitest";
import { cli } from "./cli.ts";
import { log } from "./log.ts";

describe("cli", () => {
  test("parses a workflow and prompt with quiet output by default", () => {
    expect(cli(["workflows/implement.ts", "make the change"])).toEqual({
      workflowPath: "workflows/implement.ts",
      prompt: "make the change",
      json: false,
      logMode: false,
      verbose: false,
    });
  });

  test("accepts JSON output mode", () => {
    expect(cli(["workflow.ts", "--json", "make the change"]).json).toBe(true);
  });

  test("accepts append-only log mode", () => {
    expect(cli(["workflow.ts", "--log"]).logMode).toBe(true);
  });

  test("accepts both verbose flags", () => {
    expect(cli(["-v", "workflow.ts", "make the change"]).verbose).toBe(true);
    expect(log.level).toBe("debug");
    expect(cli(["workflow.ts", "--verbose", "make the change"]).verbose).toBe(
      true,
    );
    expect(log.level).toBe("debug");
  });

  test("allows the prompt to be omitted", () => {
    expect(cli(["workflows/review.ts"])).toEqual({
      workflowPath: "workflows/review.ts",
      prompt: "",
      json: false,
      logMode: false,
      verbose: false,
    });
  });

  test("reports a missing workflow", () => {
    try {
      cli([], "runling");
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Usage: runling [-v|--verbose] [--log|--json] <workflow.ts> [prompt]",
      );
    }
  });

  test("rejects silently truncated prompts", () => {
    expect(() => cli(["workflow.ts", "make", "the change"])).toThrow(
      "The prompt must be passed as a single quoted argument",
    );
  });

  test("reports invalid options", () => {
    try {
      cli(["--unknown", "workflow.ts", "make the change"]);
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(String(error)).toContain("Unknown option");
    }
  });
});
