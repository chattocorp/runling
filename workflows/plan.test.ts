import { describe, expect, test } from "bun:test";
import type { AgentResult, Factory } from "factory";
import { plan } from "./plan.ts";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const runtimeWith = (
  prompt: string,
  reports: AgentResult[],
  answers: string[],
) => {
  const agentPrompts: string[] = [];
  const questions: string[] = [];
  let agentOptions: Record<string, unknown> | undefined;
  let disposed = false;
  const f = {
    prompt,
    cwd: "/project",
    verbose: false,
    concat: (...parts: string[]) => parts.join("\n"),
    input: async (question: string) => {
      questions.push(question);
      return answers.shift() ?? "";
    },
    agent: async function (
      this: Factory,
      options: Record<string, unknown>,
    ) {
      agentOptions = { ...options, cwd: options.cwd ?? this.cwd };
      return {
        id: "patient-pandas-1234",
        async runOutcome(agentPrompt: string) {
          agentPrompts.push(agentPrompt);
          const report = reports.shift();
          if (report === undefined) throw new Error("No agent report prepared");
          return report;
        },
        dispose() {
          disposed = true;
        },
        async [Symbol.asyncDispose]() {
          disposed = true;
        },
      };
    },
    step: <T>(_label: string, work: () => T) => work(),
  } as unknown as Factory;

  return {
    f,
    agentPrompts,
    questions,
    get agentOptions() {
      return agentOptions;
    },
    get disposed() {
      return disposed;
    },
  };
};

describe("plan workflow", () => {
  test("interviews until the agent can complete an implementation plan", async () => {
    const runtime = runtimeWith(
      "Add deployment support",
      [
        {
          outcome: "blocked",
          summary: "Which hosting provider should we target?",
          usage,
        },
        {
          outcome: "blocked",
          summary: "Should deployments happen automatically after merge?",
          usage,
        },
        {
          outcome: "completed",
          summary: "Plan deployment support",
          details: "## Plan\n\n1. Add the deployment adapter.\n2. Test it.",
          usage,
        },
      ],
      ["Fly.io", "Yes, for main"],
    );

    await expect(plan(runtime.f, "Add deployment support")).resolves.toEqual({
      summary: "Plan deployment support",
      details: "## Plan\n\n1. Add the deployment adapter.\n2. Test it.",
      outputs: {
        plan: "## Plan\n\n1. Add the deployment adapter.\n2. Test it.",
      },
    });
    expect(runtime.questions).toEqual([
      "Which hosting provider should we target?",
      "Should deployments happen automatically after merge?",
    ]);
    expect(runtime.agentPrompts).toHaveLength(3);
    expect(runtime.agentPrompts[0]).toContain("Add deployment support");
    expect(runtime.agentPrompts[1]).toContain("Fly.io");
    expect(runtime.agentPrompts[2]).toContain("Yes, for main");
    expect(runtime.agentOptions).toMatchObject({
      cwd: "/project",
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls"],
    });
    expect(runtime.disposed).toBe(true);
  });

  test("asks for the initial request when no CLI prompt was provided", async () => {
    const runtime = runtimeWith(
      "",
      [
        {
          outcome: "completed",
          summary: "Plan the requested cache",
          details: "## Plan\n\nAdd a cache.",
          usage,
        },
      ],
      ["Add a cache"],
    );

    await plan(runtime.f, "");

    expect(runtime.questions).toEqual([
      "What would you like to build or change?",
    ]);
    expect(runtime.agentPrompts[0]).toContain("Add a cache");
  });

  test("fails clearly when the planning agent fails", async () => {
    const runtime = runtimeWith(
      "Plan something",
      [
        {
          outcome: "failed",
          summary: "Could not inspect the repository",
          usage,
        },
      ],
      [],
    );

    await expect(plan(runtime.f, "Plan something")).rejects.toThrow(
      "Planning failed: Could not inspect the repository",
    );
    expect(runtime.disposed).toBe(true);
  });
});
