import { describe, expect, test } from "bun:test";
import type { Factory, Shell, WorkflowResult } from "../src/index.ts";
import { describePullRequest, postReview } from "./make-pr.ts";

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
      describePullRequest(
        f,
        "Changed the behavior to fix the bug",
        "commit abc123\n\ndiff --git a/foo.ts b/foo.ts",
      ),
    ).resolves.toEqual({
      title: "Explain the change",
      body: "## Summary\n\nExplains the change and why.",
    });

    expect(agentOptions).toMatchObject({
      cwd: "/worktree",
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls"],
    });
    expect(prompt).toContain("Changed the behavior to fix the bug");
    expect(prompt).toContain("diff --git a/foo.ts b/foo.ts");
    expect(disposed).toBe(true);
  });

  test("posts a workflow review as a pull request comment", async () => {
    let command: TemplateStringsArray | undefined;
    let expressions: unknown[] = [];
    const shell = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      command = strings;
      expressions = values;
      return Promise.resolve();
    }) as unknown as Shell;
    const f = {
      shell,
      step: <T>(_label: string, work: () => T) => work(),
    } as unknown as Factory;
    const result: WorkflowResult = {
      summary: "Found one issue",
      details: "## Findings\n\nFix the race.",
    };

    await postReview(f, "https://github.com/example/project/pull/42", result);

    expect(command?.join("_argument_")).toBe(
      "gh pr comment _argument_ --body _argument_",
    );
    expect(expressions).toEqual([
      "https://github.com/example/project/pull/42",
      "## Findings\n\nFix the race.",
    ]);
  });

  test("uses the review summary when it has no details", async () => {
    let body: unknown;
    const shell = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
      body = values[1];
      return Promise.resolve();
    }) as unknown as Shell;
    const f = {
      shell,
      step: <T>(_label: string, work: () => T) => work(),
    } as unknown as Factory;

    await postReview(f, "https://github.com/example/project/pull/42", {
      summary: "No issues found",
    });

    expect(body).toBe("No issues found");
  });
});
