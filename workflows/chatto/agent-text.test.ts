import { expect, test, vi } from "vitest";
import { createWorkflowContext, emptyTokenUsage, type AgentRunOptions } from "runling";
import { runAgentWithText } from "./agent-text.ts";

const report = { outcome: "completed" as const, summary: "For the coordinator", usage: emptyTokenUsage() };
test("delivers intermediate text before the agent finishes and waits for ordered delivery", async () => {
  const messages: string[] = [];
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const runOutcome = vi.fn(async (_ctx, _prompt, options?: AgentRunOptions) => {
    options?.onText?.("Checking theme definitions.");
    options?.onText?.("Found the theme registry.");
    await done;
    return report;
  });
  const ctx = { ...createWorkflowContext(), onText: async (text: string) => { messages.push(text); } };
  const run = runAgentWithText(ctx, { runOutcome }, "Investigate");
  await vi.waitFor(() => expect(messages).toEqual(["Checking theme definitions.", "Found the theme registry."]));
  finish();
  expect(await run).toBe(report);
  expect(messages).not.toContain(report.summary);
});

test("propagates delivery failure and tolerates an absent handler", async () => {
  const runOutcome = vi.fn(async (_ctx, _prompt, options?: AgentRunOptions) => {
    options?.onText?.("Working");
    return report;
  });
  const ctx = { ...createWorkflowContext(), onText: async () => { throw new Error("post failed"); } };
  await expect(runAgentWithText(ctx, { runOutcome }, "Go")).rejects.toThrow("post failed");
  expect(await runAgentWithText(createWorkflowContext(), { runOutcome }, "Go")).toBe(report);
});
