import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

describe("web_fetch package integration", () => {
  test("the manifest loads only the selectable web_fetch extension", async () => {
    const packageJson = await Bun.file(
      resolve(import.meta.dir, "../package.json"),
    ).json();
    expect(packageJson.pi.extensions).toEqual(["./extensions/web-fetch.ts"]);

    const temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), "factory-web-fetch-"),
    );
    try {
      const child = Bun.spawn(
        [
          process.execPath,
          resolve(import.meta.dir, "fixtures/web-fetch-loader.ts"),
          resolve(import.meta.dir, "../extensions/web-fetch.ts"),
          temporaryDirectory,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(exitCode, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({
        errors: [],
        loadedTools: ["web_fetch"],
        selectedTools: ["web_fetch"],
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
