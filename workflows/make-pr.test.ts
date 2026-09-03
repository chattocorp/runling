import { describe, expect, test } from "bun:test";
import type { Factory } from "../src/index.ts";
import { describePullRequest } from "./make-pr.ts";

describe("make-pr workflow", () => {
  test("builds PR metadata from the implementation summary and current commit", async () => {
    let disposed = false;
    let prompt = "";
    let agentOptions: Record<string, unknown> | undefined;
    const f = {
      cwd: "/worktree",
      concat: (...parts: string[]) => parts.join("\n"),
      agent: async function (
        this: Factory,
        options: Record<string, unknown>,
      ) {
        agentOptions = { ...options, cwd: options.cwd ?? this.cwd };
        const dispose = () => {
          disposed = true;
        };
        return {
          id: "test-agent-0000",
          async run(receivedPrompt: string) {
            prompt = receivedPrompt;
            return {
              outcome: "completed" as const,
              summary: "Explain the change",
              details: "## Summary\n\nExplains the change and why.",
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            };
          },
          dispose,
          async [Symbol.asyncDispose]() {
            dispose();
          },
        };
      },
      step: <T>(_label: string, work: () => T) => work(),
    } as unknown as Factory;

    await expect(
      describePullRequest(f, "Changed the behavior to fix the bug"),
    ).resolves.toEqual({
      title: "Explain the change",
      body: "## Summary\n\nExplains the change and why.",
    });

    expect(agentOptions).toMatchObject({
      cwd: "/worktree",
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "bash"],
    });
    expect(prompt).toContain("Changed the behavior to fix the bug");
    expect(prompt).toContain("Inspect the commit and its diff with git");
    expect(disposed).toBe(true);
  });
});
