import { afterEach, describe, expect, test } from "bun:test";
import { workflow } from "./workflow.ts";

const initialExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = initialExitCode ?? 0;
});

describe("workflow", () => {
  test("logs a workflow summary", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await workflow(async () => "Made the change");
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Made the change"))).toBe(true);
  });

  test("logs failures and applies a nonzero exit code", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message: string) => errors.push(message);

    try {
      await workflow(async () => {
        throw "Tests failed";
      });
    } finally {
      console.error = originalError;
    }

    expect(errors.some((line) => line.includes("Tests failed"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
