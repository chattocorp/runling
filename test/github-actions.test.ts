import { describe, expect, test } from "bun:test";

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

interface MiseConfig {
  tools?: Record<string, unknown>;
}

const workflow = Bun.YAML.parse(
  await Bun.file(workflowPath).text(),
) as Workflow;
const mise = Bun.TOML.parse(await Bun.file(misePath).text()) as MiseConfig;

describe("GitHub Actions test workflow", () => {
  test("runs for pushes and pull requests", () => {
    expect(workflow.on).toEqual(
      expect.objectContaining({ push: null, pull_request: null }),
    );
  });

  test("installs locked dependencies and runs the test suite with the project Bun version", () => {
    const bunVersion = mise.tools?.bun;
    const steps = workflow.jobs?.test?.steps;

    expect(typeof bunVersion).toBe("string");
    expect(Array.isArray(steps)).toBe(true);

    const setupIndex =
      steps?.findIndex((step) => step.uses === "oven-sh/setup-bun@v2") ?? -1;
    const installIndex =
      steps?.findIndex(
        (step) => step.run === "bun install --frozen-lockfile",
      ) ?? -1;
    const testIndex =
      steps?.findIndex((step) => step.run === "bun test") ?? -1;

    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(steps?.[setupIndex]?.with?.["bun-version"]).toBe(bunVersion);
    expect(installIndex).toBeGreaterThan(setupIndex);
    expect(testIndex).toBeGreaterThan(installIndex);
  });
});
