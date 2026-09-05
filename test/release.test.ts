import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { assertUnusedVersion } from "../scripts/check-release.mjs";

test("rejects both available and unpublished historical versions", () => {
  const metadata = {
    versions: { "0.3.0": {} },
    time: { "0.1.0": "2017-08-29" },
  };
  expect(() => assertUnusedVersion("0.3.0", metadata)).toThrow(
    "already been published",
  );
  expect(() => assertUnusedVersion("0.1.0", metadata)).toThrow(
    "already been published",
  );
  expect(() => assertUnusedVersion("0.3.1", metadata)).not.toThrow();
});

test("publishes only tested tag artifacts with a dedicated OIDC permission", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/publish.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(workflow.on.push.tags).toEqual(["v*"]);
  expect(workflow.on).toHaveProperty("workflow_dispatch");
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.publish.needs).toEqual(["package", "windows"]);
  expect(workflow.jobs.publish.if).toContain("github.event_name == 'push'");
  expect(workflow.jobs.publish.environment).toBe("npm");
  expect(workflow.jobs.publish.permissions["id-token"]).toBe("write");
  const steps = workflow.jobs.package.steps;
  expect(
    steps.some(
      (s: { run?: string }) => s.run === "node scripts/check-release.mjs",
    ),
  ).toBe(true);
  expect(
    steps.some((s: { run?: string }) => s.run === "pnpm test:package"),
  ).toBe(true);
  expect(workflow.jobs.publish.steps.at(-1).run).toContain("--ignore-scripts");
  expect(workflow.jobs.publish.steps.at(-1).run).toContain(
    'npm publish "${packages[0]}"',
  );
});
