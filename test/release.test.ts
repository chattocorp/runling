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
  expect(workflow.on.push).toEqual({ branches: ["main"] });
  expect(workflow.on).toHaveProperty("workflow_dispatch");
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.publish.needs).toEqual(["release", "package"]);
  expect(Object.keys(workflow.jobs)).toEqual(["release", "package", "publish"]);
  expect(workflow.jobs.publish.if).toContain("github.event_name == 'push'");
  expect(workflow.jobs.publish.if).toContain(
    "needs.release.outputs.created == 'true'",
  );
  expect(workflow.jobs.release.if).toBe("github.event_name == 'push'");
  expect(workflow.jobs.release.permissions).toEqual({
    contents: "write",
    "pull-requests": "write",
  });
  expect(workflow.jobs.release.outputs.created).toBe(
    "${{ steps.release.outputs.release_created }}",
  );
  expect(workflow.jobs.release.outputs.tag).toBe(
    "${{ steps.release.outputs.tag_name }}",
  );
  for (const name of ["package"]) {
    const job = workflow.jobs[name];
    expect(job.needs).toBe("release");
    expect(job.if).toContain("always()");
    expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(job.if).toContain("needs.release.outputs.created == 'true'");
    expect(job.steps[0].with.ref).toBe(
      "${{ needs.release.outputs.tag || github.sha }}",
    );
  }
  expect(workflow.jobs.publish.environment).toBe("npm");
  expect(workflow.jobs.publish.permissions["id-token"]).toBe("write");
  const steps = workflow.jobs.package.steps;
  expect(
    steps.some(
      (s: { run?: string }) => s.run === "node scripts/check-release.mjs",
    ),
  ).toBe(true);
  expect(
    steps.some((s: { run?: string }) => s.run === "pnpm test"),
  ).toBe(true);
  expect(steps.some((s: { run?: string }) => s.run === "pnpm check" || s.run === "pnpm test:package")).toBe(false);
  expect(steps.some((s: { run?: string }) => s.run?.includes("npm pack --pack-destination"))).toBe(true);
  expect(workflow.jobs.publish.steps.at(-1).run).toContain("packages=(./release/*.tgz)");
  expect(workflow.jobs.publish.steps.at(-1).run).toContain("--ignore-scripts");
  expect(workflow.jobs.publish.steps.at(-1).run).toContain(
    'npm publish "${packages[0]}"',
  );
});

test("versions the whole product without versioning private workspace packages", async () => {
  const readJson = async (path: string) =>
    JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const config = await readJson("../release-please-config.json");
  const manifest = await readJson("../.release-please-manifest.json");
  const pkg = await readJson("../packages/runling/package.json");
  expect(Object.keys(config.packages)).toEqual(["."]);
  expect(config.packages["."]).toMatchObject({
    "release-type": "simple",
    "package-name": "runling",
    "include-component-in-tag": false,
    "bump-minor-pre-major": true,
    "extra-files": [
      {
        type: "json",
        path: "packages/runling/package.json",
        jsonpath: "$.version",
      },
    ],
  });
  expect(manifest["."]).toBe(pkg.version);
  expect(
    (await readFile(new URL("../version.txt", import.meta.url), "utf8")).trim(),
  ).toBe(pkg.version);
});
