import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPwd, workingTreeHash } from "./git.ts";

async function git(cwd: string, ...args: string[]) {
  const process = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr);
  }
}

describe("workingTreeHash", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "factory-git-test-"));
    await git(cwd, "init", "--quiet");
    await Bun.write(join(cwd, "tracked.txt"), "initial\n");
    await git(cwd, "add", "tracked.txt");
    await git(
      cwd,
      "-c",
      "user.name=Factory Test",
      "-c",
      "user.email=factory@example.com",
      "commit",
      "--quiet",
      "-m",
      "initial",
    );
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  test("is stable while the working tree is unchanged", async () => {
    expect(await workingTreeHash(cwd)).toBe(await workingTreeHash(cwd));
  });

  test("changes when a tracked file changes", async () => {
    const before = await workingTreeHash(cwd);
    await Bun.write(join(cwd, "tracked.txt"), "changed\n");
    expect(await workingTreeHash(cwd)).not.toBe(before);
  });

  test("includes untracked file contents", async () => {
    const clean = await workingTreeHash(cwd);
    const path = join(cwd, "untracked.txt");

    await Bun.write(path, "first\n");
    const first = await workingTreeHash(cwd);

    await Bun.write(path, "second\n");
    const second = await workingTreeHash(cwd);

    expect(first).not.toBe(clean);
    expect(second).not.toBe(first);

    await unlink(path);
    expect(await workingTreeHash(cwd)).toBe(clean);
  });

  test("working directory snapshots report unchanged state", async () => {
    const pwd = await getPwd(cwd);
    expect(await pwd.hasChanges).toBe(false);
  });

  test("working directory snapshots report later changes", async () => {
    const pwd = await getPwd(cwd);
    await Bun.write(join(cwd, "tracked.txt"), "changed\n");
    expect(await pwd.hasChanges).toBe(true);
  });
});
