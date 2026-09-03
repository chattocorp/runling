import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Factory, WorkflowResult } from "../src/index.ts";
import { implement } from "./implement.ts";

const worktreesDirectory = "../factory-worktrees";

async function makePullRequest(
  f: Factory,
): Promise<WorkflowResult> {
  const { cwd } = f;
  await f.shell`gh auth status`;

  const worktreeId = f.randomId();
  const branchName = `factory/${worktreeId}`;
  const worktreesPath = resolve(cwd, worktreesDirectory);
  const worktreePath = resolve(worktreesPath, worktreeId);

  await mkdir(worktreesPath, { recursive: true });
  await f.shell`git worktree add -b ${branchName} ${worktreePath}`;
  f.log.info(`Working in ${worktreePath}`);

  const worktree = { ...f, cwd: worktreePath };
  await worktree.shell`bun install --frozen-lockfile`;
  const summary = await implement(worktree);

  await worktree.shell`git add --all`;
  await worktree.shell`git commit -m ${summary}`;
  await worktree.shell`git push --set-upstream origin ${branchName}`;

  const pullRequestBody = f.concat(
    "## Summary",
    "",
    summary,
    "",
    "## Validation",
    "",
    "- `bun run check`",
    "- `bun test`",
  );
  const pullRequest =
    await worktree.shell`gh pr create --head ${branchName} --title ${summary.slice(0, 120)} --body ${pullRequestBody}`.quiet();
  const pullRequestUrl = pullRequest.stdout.toString().trim();

  await f.shell`git worktree remove ${worktreePath}`;

  return {
    summary: `Opened ${pullRequestUrl}`,
    outputs: {
      branchName,
      pullRequestUrl,
    },
  };
}

export default makePullRequest;
