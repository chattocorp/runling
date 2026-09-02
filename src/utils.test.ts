import { describe, expect, test } from "bun:test";
import { concat, withRetries } from "./utils.ts";

describe("concat", () => {
  test("joins its arguments with newlines", () => {
    expect(concat("first", "second", "third")).toBe(
      "first\nsecond\nthird",
    );
  });

  test("preserves explicit blank lines", () => {
    expect(concat("first", "", "second")).toBe("first\n\nsecond");
  });

  test("flattens array arguments", () => {
    expect(concat("first", ["second", ["third", "fourth"]])).toBe(
      "first\nsecond\nthird\nfourth",
    );
  });

  test("returns an empty string without arguments", () => {
    expect(concat()).toBe("");
  });
});

describe("withRetries", () => {
  test("returns after the first successful attempt", async () => {
    const attempts: number[] = [];

    const result = await withRetries(3, (attempt) => {
      attempts.push(attempt);
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toEqual([1]);
  });

  test("retries while the function throws", async () => {
    const attempts: number[] = [];

    const result = await withRetries(3, (attempt) => {
      attempts.push(attempt);
      if (attempt < 3) {
        throw new Error("not yet");
      }
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toEqual([1, 2, 3]);
  });

  test("runs the retry hook only before another attempt", async () => {
    const failures: string[] = [];

    await expect(
      withRetries(
        3,
        (attempt) => {
          throw new Error(`failure ${attempt}`);
        },
        (error, attempt) => {
          failures.push(`${attempt}:${(error as Error).message}`);
        },
      ),
    ).rejects.toThrow("failure 3");

    expect(failures).toEqual(["1:failure 1", "2:failure 2"]);
  });

  test("rethrows the final error after exhausting all attempts", async () => {
    const finalError = new Error("still broken");

    await expect(
      withRetries(2, (attempt) => {
        throw attempt === 2 ? finalError : new Error("broken");
      }),
    ).rejects.toBe(finalError);
  });

  test("requires a positive integer attempt count", async () => {
    await expect(withRetries(0, () => undefined)).rejects.toThrow(RangeError);
    await expect(withRetries(1.5, () => undefined)).rejects.toThrow(RangeError);
  });
});
