import { describe, expect, test } from "bun:test";
import type { Factory } from "factory";
import { chattoDocs } from "./chatto-docs.ts";

const completedReport = {
  outcome: "completed" as const,
  summary: "Chatto is an open-source communication platform",
  details:
    "Chatto is an open-source communication platform. [Introduction](https://docs.chatto.run/getting-started/introduction/)",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

describe("chatto-docs workflow", () => {
  test("answers the CLI question using only the web tool", async () => {
    const prompts: string[] = [];
    const options: Record<string, unknown>[] = [];
    const steps: string[] = [];
    const f = {
      prompt: "What is Chatto?",
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

    await expect(chattoDocs(f, "What is Chatto?")).resolves.toEqual({
      summary: completedReport.summary,
      details: completedReport.details,
      outputs: { answer: completedReport.details },
    });
    expect(steps).toEqual([
      "Answer Chatto documentation question",
      "Consulting Chatto documentation",
    ]);
    expect(prompts[0]).toContain("What is Chatto?");
    expect(prompts[0]).toContain(
      "https://docs.chatto.run/getting-started/introduction/",
    );
    expect(options[0]).toMatchObject({
      model: "openrouter/z-ai/glm-5.3-flash",
      thinkingLevel: "low",
      tools: ["web_fetch"],
      instructions: expect.arrayContaining([
        "Use only pages on docs.chatto.run as factual sources.",
      ]),
    });
  });

  test("asks for a question when the CLI prompt is empty", async () => {
    const questions: string[] = [];
    const prompts: string[] = [];
    const f = {
      prompt: " ",
      input: async (question: string) => {
        questions.push(question);
        return "How do I get started?";
      },
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      runAgent: async (prompt: string) => {
        prompts.push(prompt);
        return completedReport;
      },
      step: <T>(_name: string, work: () => T) => work(),
    } as unknown as Factory;

    await chattoDocs(f, " ");

    expect(questions).toEqual(["What would you like to know about Chatto?"]);
    expect(prompts[0]).toContain("How do I get started?");
  });
});
