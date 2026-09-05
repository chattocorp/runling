import { describe, expect, test } from "vitest";
import type { Runling } from "runling";
import { research } from "./research.ts";

const completedReport = {
  outcome: "completed" as const,
  summary: "Bun is a JavaScript runtime and toolkit",
  details:
    "# Bun\n\nBun is a JavaScript runtime and toolkit. [Source](https://bun.com/docs)",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

describe("research workflow", () => {
  test("researches the CLI topic with only the web tool", async () => {
    const prompts: string[] = [];
    const options: Record<string, unknown>[] = [];
    const steps: string[] = [];
    const f = {
      prompt: "The Bun JavaScript runtime",
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
    } as unknown as Runling;

    await expect(research(f, "The Bun JavaScript runtime")).resolves.toEqual({
      summary: completedReport.summary,
      details: completedReport.details,
      outputs: { research: completedReport.details },
    });
    expect(steps).toEqual(["Research topic", "Researching topic"]);
    expect(prompts[0]).toContain("The Bun JavaScript runtime");
    expect(prompts[0]).toContain("multiple relevant sources");
    expect(options[0]).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["web_fetch"],
    });
  });

  test("asks for a topic when the CLI prompt is empty", async () => {
    const questions: string[] = [];
    const prompts: string[] = [];
    const f = {
      prompt: "  ",
      input: async (question: string) => {
        questions.push(question);
        return "Agentic software factories";
      },
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      runAgent: async (prompt: string) => {
        prompts.push(prompt);
        return completedReport;
      },
      step: <T>(_name: string, work: () => T) => work(),
    } as unknown as Runling;

    await research(f, "  ");

    expect(questions).toEqual(["What topic should I research?"]);
    expect(prompts[0]).toContain("Agentic software factories");
  });
});
