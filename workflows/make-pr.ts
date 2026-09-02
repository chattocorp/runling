import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  cli,
  concat,
  createShell,
  log,
  workflow,
} from "../src/index.ts";
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
  const shell = createShell({ verbose });
  await shell`gh auth status`;

  const branchName = createBranchName(prompt);
  const worktreesPath = resolve(worktreesDirectory);
  const worktreePath = resolve(
    worktreesPath,
    branchName.replaceAll("/", "-"),
  );

  await mkdir(worktreesPath, { recursive: true });
  await shell`git worktree add -b ${branchName} ${worktreePath}`;
  log.info(`Working in ${worktreePath}`);

  await shell`bun install --frozen-lockfile`.cwd(worktreePath);
  const summary = await implement(prompt, { cwd: worktreePath, verbose });

  await shell`git add --all`.cwd(worktreePath);
  await shell`git commit -m ${summary}`.cwd(worktreePath);
  await shell`git push --set-upstream origin ${branchName}`.cwd(worktreePath);

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
    await shell`gh pr create --head ${branchName} --title ${summary.slice(0, 120)} --body ${pullRequestBody}`
      .cwd(worktreePath)
      .quiet();
  const pullRequestUrl = pullRequest.stdout.toString().trim();

  await shell`git worktree remove ${worktreePath}`;

  return pullRequestUrl;
});
