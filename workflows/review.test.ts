import { describe, expect, test } from "bun:test";
import type { Factory, FactoryAgent, Shell } from "../src/index.ts";
import { review } from "./review.ts";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

describe("review workflow", () => {
  test("forks a shared investigation into parallel focused reviews", async () => {
    const prompts: string[] = [];
    const steps: string[] = [];
    let forks = 0;
    let disposed = 0;
    let disposedWhileRunning = 0;
    let activeReviews = 0;
    let maxActiveReviews = 0;
    let allReviewsStarted!: () => void;
    const reviewsStarted = new Promise<void>((resolve) => {
      allReviewsStarted = resolve;
    });

    const branch = (): FactoryAgent => ({
      id: `reviewer-${forks}`,
      async run(prompt) {
        prompts.push(prompt);
        activeReviews++;
        maxActiveReviews = Math.max(maxActiveReviews, activeReviews);
        if (activeReviews === 3) allReviewsStarted();
        await reviewsStarted;
        activeReviews--;
        return {
          outcome: "completed",
          summary: `Finding: ${prompt}`,
          details: "Detailed finding",
          usage,
        };
      },
      async runOutcome() {
        throw new Error("not used");
      },
      async fork() {
        throw new Error("not used");
      },
      dispose() {
        if (activeReviews > 0) disposedWhileRunning++;
        disposed++;
      },
      async [Symbol.asyncDispose]() {
        this.dispose();
      },
    });

    let orchestratorRuns = 0;
    const orchestrator: FactoryAgent = {
      id: "orchestrator",
      async run(prompt) {
        prompts.push(prompt);
        orchestratorRuns++;
        return orchestratorRuns === 1
          ? {
              outcome: "completed",
              summary: "Understood the change",
              usage,
            }
          : {
              outcome: "completed",
              summary: "Found two issues",
              details: "## Findings\n\nTwo actionable issues.",
              usage,
            };
      },
      async runOutcome() {
        throw new Error("not used");
      },
      async fork() {
        forks++;
        return branch();
      },
      dispose() {
        disposed++;
      },
      async [Symbol.asyncDispose]() {
        this.dispose();
      },
    };

    const shell = ((strings: TemplateStringsArray) => ({
      async text() {
        return strings.join("").startsWith("git status")
          ? " M src/example.ts\n"
          : "diff --git a/src/example.ts b/src/example.ts";
      },
    })) as unknown as Shell;
    let agentOptions: Record<string, unknown> | undefined;
    const f = {
      cwd: "/project",
      prompt: "Review the current change",
      shell,
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      agent: async (options: Record<string, unknown>) => {
        agentOptions = options;
        return orchestrator;
      },
      step: <T>(name: string, run: () => T) => {
        steps.push(name);
        return run();
      },
    } as unknown as Factory;

    await expect(review(f)).resolves.toEqual({
      summary: "Found two issues",
      details: "## Findings\n\nTwo actionable issues.",
      outputs: { review: "## Findings\n\nTwo actionable issues." },
    });

    expect(agentOptions).toMatchObject({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls"],
    });
    expect(forks).toBe(3);
    expect(maxActiveReviews).toBe(3);
    expect(disposedWhileRunning).toBe(0);
    expect(disposed).toBe(4);
    expect(steps).toContain("Review correctness");
    expect(steps).toContain("Review testing");
    expect(steps).toContain("Review simplicity");
    expect(prompts.at(-1)).toContain("Detailed finding");
  });

  test("waits for every parallel review before reporting a failure", async () => {
    let forks = 0;
    let finishedReviews = 0;
    let disposed = 0;

    const orchestrator = {
      id: "orchestrator",
      run: async () => ({
        outcome: "completed" as const,
        summary: "Understood the change",
        usage,
      }),
      runOutcome: async () => {
        throw new Error("not used");
      },
      fork: async () => {
        const fork = forks++;
        return {
          id: `reviewer-${fork}`,
          run: async () => {
            if (fork === 0) throw new Error("review failed");
            await Promise.resolve();
            finishedReviews++;
            return {
              outcome: "completed" as const,
              summary: "No findings",
              usage,
            };
          },
          runOutcome: async () => {
            throw new Error("not used");
          },
          fork: async () => {
            throw new Error("not used");
          },
          dispose: () => {
            disposed++;
          },
          async [Symbol.asyncDispose]() {
            this.dispose();
          },
        } satisfies FactoryAgent;
      },
      dispose: () => {
        disposed++;
      },
      async [Symbol.asyncDispose]() {
        this.dispose();
      },
    } satisfies FactoryAgent;

    const shell = ((strings: TemplateStringsArray) => ({
      text: async () =>
        strings.join("").startsWith("git status")
          ? " M src/example.ts\n"
          : "diff --git a/src/example.ts b/src/example.ts",
    })) as unknown as Shell;
    const f = {
      shell,
      prompt: "Review the current change",
      concat: (...parts: Array<string | string[]>) => parts.flat().join("\n"),
      agent: async () => orchestrator,
      step: <T>(_name: string, run: () => T) => run(),
    } as unknown as Factory;

    await expect(review(f)).rejects.toThrow("review failed");
    expect(finishedReviews).toBe(2);
    expect(disposed).toBe(4);
  });

  test("returns without creating an agent when there are no changes", async () => {
    const shell = (() => ({ text: async () => "" })) as unknown as Shell;
    const f = {
      shell,
      step: <T>(_name: string, run: () => T) => run(),
      agent: () => {
        throw new Error("agent should not be created");
      },
    } as unknown as Factory;

    await expect(review(f)).resolves.toEqual({
      summary: "No changes to review",
    });
  });
});
