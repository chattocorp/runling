import { describe, expect, test } from "bun:test";
import { run } from "./command.ts";
import { FactoryError } from "./errors.ts";

describe("run", () => {
  test("returns the successful command result", async () => {
    const result = await run("Checking command")`printf factory-output`;

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("factory-output");
  });

  test("turns non-zero exits into workflow errors", async () => {
    try {
      await run("Checking command")`exit 7`;
      throw new Error("Expected the command to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FactoryError);
      expect((error as FactoryError).message).toBe("Checking command failed");
      expect((error as FactoryError).exitCode).toBe(3);
    }
  });

  test("returns non-zero results when checking a command", async () => {
    const result = await run.check("Checking command")`exit 7`;

    expect(result.exitCode).toBe(7);
  });
});
