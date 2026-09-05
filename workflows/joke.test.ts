import { describe, expect, test } from "bun:test";
import type { Factory } from "factory";
import { joke } from "./joke.ts";

describe("joke workflow", () => {
  test("asks for a topic and returns an agent-written joke", async () => {
    const questions: string[] = [];
    const prompts: string[] = [];
    const steps: string[] = [];
    const options: Record<string, unknown>[] = [];
    const f = {
      input: async (question: string) => {
        questions.push(question);
        return "TypeScript";
      },
      runAgent: async (prompt: string, agentOptions: Record<string, unknown>) => {
        prompts.push(prompt);
        options.push(agentOptions);
        return {
          outcome: "completed" as const,
          summary: "A joke",
          details: "TypeScript walked into a bar, but JavaScript let it in anyway.",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        };
      },
      step: <T>(name: string, work: () => T) => {
        steps.push(name);
        return work();
      },
    } as unknown as Factory;

    await expect(joke(f)).resolves.toBe(
      "# Joke\n\nTypeScript walked into a bar, but JavaScript let it in anyway.",
    );
    expect(questions).toEqual(["What should the joke be about?"]);
    expect(steps).toEqual(["Tell a joke", "Write joke", "Review joke for funniness"]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("TypeScript walked into a bar, but JavaScript let it in anyway.");
    expect(options[1]).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "low",
      tools: [],
    });
    expect(prompts[0]).toContain('"TypeScript"');
    expect(options[0]).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "low",
      tools: [],
    });
  });

  test("uses the invocation prompt without asking for input", async () => {
    let askedForInput = false;
    const prompts: string[] = [];
    const f = {
      prompt: "webhooks",
      input: async () => {
        askedForInput = true;
        return "unused";
      },
      runAgent: async (prompt: string) => {
        prompts.push(prompt);
        return {
          outcome: "completed" as const,
          summary: "A webhook joke",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        };
      },
      step: <T>(_name: string, work: () => T) => work(),
    } as unknown as Factory;

    await joke(f);

    expect(askedForInput).toBe(false);
    expect(prompts[0]).toContain('"webhooks"');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('"A webhook joke"');
  });
});
