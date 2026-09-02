import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  FactoryRuntime,
  FactoryWorkflow,
  WorkflowInvocation,
} from "../src/index.ts";
import { implement } from "./implement.ts";

const worktreesDirectory = "../factory-worktrees";

function createBranchName(prompt: string, randomId: FactoryRuntime["randomId"]) {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");

  return `factory/${slug || "change"}-${randomId()}`;
}

async function makePullRequest(
  factory: FactoryRuntime,
  invocation: WorkflowInvocation,
): Promise<string> {
  const { concat, createShell, log, randomId } = factory;
  const { cwd, prompt, verbose } = invocation;
  const $ = createShell({ verbose });
  await $`gh auth status`.cwd(cwd);

  const branchName = createBranchName(prompt, randomId);
  const worktreesPath = resolve(cwd, worktreesDirectory);
  const worktreePath = resolve(worktreesPath, branchName.replaceAll("/", "-"));

  await mkdir(worktreesPath, { recursive: true });
  await $`git worktree add -b ${branchName} ${worktreePath}`.cwd(cwd);
  log.info(`Working in ${worktreePath}`);

  await $`bun install --frozen-lockfile`.cwd(worktreePath);
  const summary = await implement(factory, {
    ...invocation,
    cwd: worktreePath,
  });

  await $`git add --all`.cwd(worktreePath);
  await $`git commit -m ${summary}`.cwd(worktreePath);
  await $`git push --set-upstream origin ${branchName}`.cwd(worktreePath);

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

  await $`git worktree remove ${worktreePath}`;

  return pullRequestUrl;
}

export default makePullRequest satisfies FactoryWorkflow;
