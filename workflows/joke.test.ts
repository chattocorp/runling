import { describe, expect, test } from "bun:test";
import { AgentOutcomeError, type Factory } from "../src/index.ts";
import type { AgentResult } from "../src/agent.ts";
import { withOpeningJoke } from "./joke.ts";

const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 };

function factoryWith(
  report: AgentResult,
  events: string[],
  captureOptions?: (options: Record<string, unknown>) => void,
): Factory {
  return {
    AgentOutcomeError,
    log: { info: (message: string) => events.push(`joke:${message}`) },
    runAgent: async (_prompt: string, options: Record<string, unknown>) => {
      events.push("agent");
      captureOptions?.(options);
      return report;
    },
    step: async <T>(_label: string, run: () => T) => await run(),
  } as unknown as Factory;
}

describe("withOpeningJoke", () => {
  test("generates and presents a joke before running the workflow", async () => {
    const events: string[] = [];
    let options: Record<string, unknown> | undefined;
    const f = factoryWith(
      {
        outcome: "completed",
        summary: "Why did the function return? It had closure.",
        usage,
      },
      events,
      (received) => {
        options = received;
      },
    );
    const run = withOpeningJoke(async () => {
      events.push("workflow");
      return "Done";
    });

    await expect(run(f)).resolves.toBe("Done");
    expect(events).toEqual([
      "agent",
      "joke:Why did the function return? It had closure.",
      "workflow",
    ]);
    expect(options).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "low",
      tools: [],
    });
  });

  test("does not start the workflow when joke generation fails", async () => {
    const events: string[] = [];
    const f = factoryWith(
      { outcome: "failed", summary: "No joke generated", usage },
      events,
    );
    const run = withOpeningJoke(() => {
      events.push("workflow");
    });

    await expect(run(f)).rejects.toThrow("No joke generated");
    expect(events).toEqual(["agent"]);
  });
});
