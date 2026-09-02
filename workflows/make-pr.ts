import { $ } from "bun";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cli, concat, log, workflow } from "../src/index.ts";
import { implement } from "./implement.ts";

const worktreesDirectory = "../factory-worktrees";

function createBranchName(prompt: string) {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");

  return `factory/${slug || "change"}-${crypto.randomUUID().slice(0, 8)}`;
}

await workflow(async () => {
  const { prompt, verbose } = cli();
  await $`gh auth status`.quiet(!verbose);

  const branchName = createBranchName(prompt);
  const worktreesPath = resolve(worktreesDirectory);
  const worktreePath = resolve(
    worktreesPath,
    branchName.replaceAll("/", "-"),
  );

  await mkdir(worktreesPath, { recursive: true });
  await $`git worktree add -b ${branchName} ${worktreePath}`.quiet(!verbose);
  log.info(`Working in ${worktreePath}`);

  await $`bun install --frozen-lockfile`
    .cwd(worktreePath)
    .quiet(!verbose);
  const summary = await implement(prompt, { cwd: worktreePath, verbose });

  await $`git add --all`.cwd(worktreePath).quiet(!verbose);
  await $`git commit -m ${summary}`.cwd(worktreePath).quiet(!verbose);
  await $`git push --set-upstream origin ${branchName}`
    .cwd(worktreePath)
    .quiet(!verbose);

  const pullRequestBody = concat(
    "## Summary",
    "",
    summary,
    "",
    "## Validation",
    "",
    "- `bun run check`",
  );
  const pullRequest =
    await $`gh pr create --head ${branchName} --title ${summary.slice(0, 120)} --body ${pullRequestBody}`
      .cwd(worktreePath)
      .quiet();
  const pullRequestUrl = pullRequest.stdout.toString().trim();

  await $`git worktree remove ${worktreePath}`.quiet(!verbose);

  return pullRequestUrl;
});
