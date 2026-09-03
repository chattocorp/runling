import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Factory, WorkflowResult } from "../src/index.ts";
import { implement } from "./implement.ts";

const worktreesDirectory = "../factory-worktrees";

function createBranchName(prompt: string, randomId: Factory["randomId"]) {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");

  return `factory/${slug || "change"}-${randomId()}`;
}

async function makePullRequest(
  f: Factory,
): Promise<WorkflowResult> {
  const { cwd } = f;
  await f.shell`gh auth status`;

  const branchName = createBranchName(f.prompt, f.randomId);
  const worktreesPath = resolve(cwd, worktreesDirectory);
  const worktreePath = resolve(
    worktreesPath,
    branchName.replaceAll("/", "-"),
  );

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
