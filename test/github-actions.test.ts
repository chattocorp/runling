import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const workflowPath = new URL("../.github/workflows/test.yml", import.meta.url);
const misePath = new URL("../mise.toml", import.meta.url);

interface WorkflowStep {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Workflow {
  on?: Record<string, unknown>;
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

const workflow = parse(await readFile(workflowPath, "utf8")) as Workflow;
const nodeVersion = (await readFile(misePath, "utf8")).match(
  /node = "([^"]+)"/,
)?.[1];

describe("GitHub Actions test workflow", () => {
  test("runs for pushes and pull requests", () => {
    expect(workflow.on).toEqual(
      expect.objectContaining({ push: null, pull_request: null }),
    );
  });

  test("installs locked dependencies and tests the package with the project Node version", () => {
    const steps = workflow.jobs?.test?.steps;

    expect(typeof nodeVersion).toBe("string");
    expect(Array.isArray(steps)).toBe(true);

    const setupIndex =
      steps?.findIndex((step) => step.uses === "actions/setup-node@v4") ?? -1;
    const installIndex =
      steps?.findIndex(
        (step) => step.run === "pnpm install --frozen-lockfile",
      ) ?? -1;
    const testIndex =
      steps?.findIndex((step) => step.run === "pnpm test") ?? -1;

    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(steps?.[setupIndex]?.with?.["node-version"]).toBe(nodeVersion);
    expect(installIndex).toBeGreaterThan(setupIndex);
    expect(testIndex).toBeGreaterThan(installIndex);
    expect(Object.keys(workflow.jobs ?? {})).toEqual(["test"]);
    expect(steps?.flatMap((step) => step.run ? [step.run] : [])).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm test",
    ]);
  });
});
