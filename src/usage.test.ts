import { describe, expect, test } from "bun:test";
import {
  accumulateTokenUsage,
  emptyTokenUsage,
  formatTokenUsage,
  getRecordedTokenUsage,
  isTokenUsage,
  recordTokenUsage,
  resetTokenUsage,
  totalTokens,
} from "./usage.ts";

describe("token usage", () => {
  test("emptyTokenUsage returns zeroed counters", () => {
    expect(emptyTokenUsage()).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  test("accumulateTokenUsage adds all counters", () => {
    const total = emptyTokenUsage();

    accumulateTokenUsage(total, {
      input: 100,
      output: 20,
      cacheRead: 500,
      cacheWrite: 10,
    });
    accumulateTokenUsage(total, {
      input: 50,
      output: 25,
      cacheRead: 550,
      cacheWrite: 15,
    });

    expect(total).toEqual({
      input: 150,
      output: 45,
      cacheRead: 1050,
      cacheWrite: 25,
    });
  });

  test("accumulateTokenUsage ignores missing or malformed usage", () => {
    const total = emptyTokenUsage();

    accumulateTokenUsage(total, undefined);
    accumulateTokenUsage(total, {} as never);
    accumulateTokenUsage(total, { input: "many" } as never);

    expect(total).toEqual(emptyTokenUsage());
  });

  test("totalTokens sums all counters", () => {
    expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(
      10,
    );
    expect(totalTokens(emptyTokenUsage())).toBe(0);
  });

  test("formatTokenUsage reports input and output tokens", () => {
    expect(formatTokenUsage({ input: 1200, output: 340, cacheRead: 0, cacheWrite: 0 })).toBe(
      "in 1,200, out 340",
    );
  });

  test("formatTokenUsage includes cached token counts when present", () => {
    expect(
      formatTokenUsage({ input: 100, output: 20, cacheRead: 500, cacheWrite: 10 }),
    ).toBe("in 100, out 20, cache read 500, cache write 10");
  });

  test("isTokenUsage validates usage objects", () => {
    expect(isTokenUsage(emptyTokenUsage())).toBe(true);
    expect(isTokenUsage({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(
      true,
    );
    expect(isTokenUsage(undefined)).toBe(false);
    expect(isTokenUsage({})).toBe(false);
    expect(isTokenUsage({ input: 1 })).toBe(false);
  });
});

describe("recorded token usage", () => {
  test("records usage across interactions and resets", () => {
    resetTokenUsage();

    recordTokenUsage({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });
    recordTokenUsage({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });

    expect(getRecordedTokenUsage()).toEqual({
      input: 11,
      output: 7,
      cacheRead: 3,
      cacheWrite: 4,
    });

    resetTokenUsage();

    expect(getRecordedTokenUsage()).toEqual(emptyTokenUsage());
  });
});
