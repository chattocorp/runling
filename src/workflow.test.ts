import { afterEach, describe, expect, test } from "bun:test";
import { formatDuration, workflow } from "./workflow.ts";

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

  test("logs the elapsed time after a successful run", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => logs.push(message);

    try {
      await workflow(async () => undefined);
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes("Finished in "))).toBe(true);
  });

  test("logs the elapsed time after a failed run", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message: string) => logs.push(message);
    console.error = (message: string) => errors.push(message);

    try {
      await workflow(async () => {
        throw "Tests failed";
      });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(logs.some((line) => line.includes("Finished in "))).toBe(true);
  });
});

describe("formatDuration", () => {
  test("formats sub-second durations in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(42.4)).toBe("42ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("formats sub-minute durations in seconds", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(12_345)).toBe("12.3s");
  });

  test("formats durations in minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(61_000)).toBe("1m1s");
    expect(formatDuration(125_000)).toBe("2m5s");
  });

  test("formats durations in hours, minutes, and seconds", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_660_000)).toBe("1h1m");
    expect(formatDuration(3_661_000)).toBe("1h1m1s");
    expect(formatDuration(7_385_000)).toBe("2h3m5s");
  });
});
