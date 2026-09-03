import { describe, expect, test } from "bun:test";

const workflowPath = new URL("../.github/workflows/test.yml", import.meta.url);
const misePath = new URL("../mise.toml", import.meta.url);
const workflow = await Bun.file(workflowPath).text();
const mise = await Bun.file(misePath).text();

describe("GitHub Actions test workflow", () => {
  test("runs for pushes and pull requests", () => {
    expect(workflow).toMatch(/on:\s*\n\s+push:\s*\n\s+pull_request:/);
  });

  test("installs locked dependencies and runs the test suite with the project Bun version", () => {
    const bunVersion = mise.match(/^bun = "([^"]+)"$/m)?.[1];

    expect(bunVersion).toBeDefined();
    expect(workflow).toContain(`bun-version: ${bunVersion}`);
    expect(workflow).toContain("run: bun install --frozen-lockfile");
    expect(workflow).toContain("run: bun test");
  });
});
