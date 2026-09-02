import { describe, expect, test } from "bun:test";
import { withRetries } from "./retries.ts";

describe("withRetries", () => {
  test("returns after the first successful attempt", async () => {
    const attempts: number[] = [];

    const result = await withRetries(3, ({ attempt }) => {
      attempts.push(attempt);
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toEqual([1]);
  });

  test("awaits failure handling before retrying", async () => {
    const events: string[] = [];

    const result = await withRetries(
      3,
      async ({ attempt, attempts }) => {
        events.push(`work ${attempt}/${attempts}`);
        if (attempt < 2) {
          throw new Error("not yet");
        }
        return "done";
      },
      async ({ attempt, attempts, error }) => {
        await Promise.resolve();
        events.push(
          `repair ${attempt}/${attempts}: ${(error as Error).message}`,
        );
      },
    );

    expect(result).toBe("done");
    expect(events).toEqual([
      "work 1/3",
      "repair 1/3: not yet",
      "work 2/3",
    ]);
  });

  test("rethrows the final failure without handling it", async () => {
    const handled: number[] = [];

    await expect(
      withRetries(
        2,
        ({ attempt }) => {
          throw new Error(`failure ${attempt}`);
        },
        ({ attempt }) => {
          handled.push(attempt);
        },
      ),
    ).rejects.toThrow("failure 2");
    expect(handled).toEqual([1]);
  });

  test("rejects invalid attempt counts", async () => {
    await expect(withRetries(0, () => undefined)).rejects.toThrow(
      "attempts must be a positive integer",
    );
    await expect(withRetries(1.5, () => undefined)).rejects.toThrow(
      "attempts must be a positive integer",
    );
  });
});
