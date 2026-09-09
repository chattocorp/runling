import { describe, expect, expectTypeOf, test } from "vitest";
import { createObservedWorkflowContext, createWorkflowContext } from "./context.ts";
import { emptyTokenUsage, type TokenUsage } from "./usage.ts";

describe("workflow context", () => {
  test("returns independent read-only snapshots", () => {
    const ctx = createWorkflowContext();
    expectTypeOf(ctx.usage).toEqualTypeOf<Readonly<TokenUsage>>();
    const before = ctx.usage;
    ctx.recordUsage({ ...emptyTokenUsage(), input: 10, cost: 0.25 });
    expect(before).toEqual(emptyTokenUsage());
    expect(ctx.usage).not.toBe(ctx.usage);
    // A caller that bypasses readonly typing still cannot change the totals.
    (ctx.usage as TokenUsage).input = 999;
    expect(ctx.usage).toEqual({ ...emptyTokenUsage(), input: 10, cost: 0.25 });
    expect(ctx).not.toHaveProperty("cwd");
  });

  test("accumulates tokens and known costs while retaining missing-price information", () => {
    const ctx = createWorkflowContext();
    ctx.recordUsage({ input: 10, output: 2, cacheRead: 3, cacheWrite: 1, cost: { total: 0.25 } });
    ctx.recordUsage({ input: 4, output: 5, cacheRead: 6, cacheWrite: 2 });
    ctx.recordUsage({ ...emptyTokenUsage(), input: 1, cost: 0 });
    expect(ctx.usage).toEqual({
      input: 15, output: 7, cacheRead: 9, cacheWrite: 3, cost: 0.25, costIncomplete: true,
    });
  });

  test("ignores invalid counts and preserves existing malformed-cost rules", () => {
    const snapshots: TokenUsage[] = [];
    const ctx = createObservedWorkflowContext(usage => snapshots.push(usage));
    for (const input of [-1, NaN, Infinity, 1.5]) {
      ctx.recordUsage({ ...emptyTokenUsage(), input });
    }
    ctx.recordUsage(undefined as never);
    ctx.recordUsage({ input: 1 } as never);
    expect(ctx.usage).toEqual(emptyTokenUsage());
    expect(snapshots).toEqual([]);
    ctx.recordUsage({ ...emptyTokenUsage(), input: 1, cost: -1 });
    expect(ctx.usage).toEqual({ ...emptyTokenUsage(), input: 1, costIncomplete: true });
  });

  test("notifies observers with separate snapshots", () => {
    const snapshots: TokenUsage[] = [];
    const ctx = createObservedWorkflowContext(usage => snapshots.push(usage));
    ctx.recordUsage({ ...emptyTokenUsage(), input: 1, cost: 0 });
    ctx.recordUsage({ ...emptyTokenUsage(), input: 2, cost: 0.5 });
    expect(snapshots.map(usage => usage.input)).toEqual([1, 3]);
    snapshots[1]!.input = 999;
    expect(ctx.usage.input).toBe(3);
  });

  test("shares totals across parallel work only when the same context is passed", async () => {
    const run = async (input: number) => {
      const ctx = createWorkflowContext();
      await Promise.all([1, 2].map(async () => {
        await Promise.resolve();
        ctx.recordUsage({ ...emptyTokenUsage(), input, cost: 0.25 });
      }));
      return ctx.usage;
    };
    const [first, second] = await Promise.all([run(10), run(100)]);
    expect(first).toEqual({ ...emptyTokenUsage(), input: 20, cost: 0.5 });
    expect(second).toEqual({ ...emptyTokenUsage(), input: 200, cost: 0.5 });
  });
});
