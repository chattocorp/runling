import { describe, expect, test } from "bun:test";
import type { Factory } from "../src/index.ts";
import { ask } from "./ask.ts";

const completedReport = {
  outcome: "completed" as const,
  summary: "Workflows receive a Factory object",
  details:
    "Workflow entrypoints receive one `Factory` containing runtime primitives (`src/runtime.ts:82`).",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

describe("ask workflow", () => {
  test("answers the CLI question using only read-only repository tools", async () => {
    const prompts: string[] = [];
    const options: Record<string, unknown>[] = [];
    const steps: string[] = [];
    const f = {
      prompt: "How do workflow entrypoints receive runtime primitives?",
      input: () => {
        throw new Error("input should not be requested");
      },
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      runAgent: async (prompt: string, agentOptions: Record<string, unknown>) => {
        prompts.push(prompt);
        options.push(agentOptions);
        return completedReport;
      },
      step: <T>(name: string, work: () => T) => {
        steps.push(name);
        return work();
      },
    } as unknown as Factory;

    await expect(ask(f)).resolves.toEqual({
      summary: completedReport.summary,
      details: completedReport.details,
      outputs: { answer: completedReport.details },
    });
    expect(steps).toEqual([
      "Answer repository question",
      "Investigating repository",
    ]);
    expect(prompts[0]).toContain(
      "How do workflow entrypoints receive runtime primitives?",
    );
    expect(options[0]).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls"],
    });
  });

  test("asks for a question when the CLI prompt is empty", async () => {
    const questions: string[] = [];
    const prompts: string[] = [];
    const f = {
      prompt: "",
      input: async (question: string) => {
        questions.push(question);
        return "Where are agent tools configured?";
      },
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      runAgent: async (prompt: string) => {
        prompts.push(prompt);
        return completedReport;
      },
      step: <T>(_name: string, work: () => T) => work(),
    } as unknown as Factory;

    await ask(f);

    expect(questions).toEqual([
      "What would you like to know about the repository?",
    ]);
    expect(prompts[0]).toContain("Where are agent tools configured?");
  });
});
