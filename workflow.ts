import { $ } from "bun";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  agent,
  cli,
  concat,
  getPwd,
  log,
  workflow,
} from "./src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;
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

async function runChecks(cwd: string, verbose: boolean) {
  for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
    try {
      await $`bun run check`.cwd(cwd).quiet(!verbose);
      return;
    } catch (error) {
      if (!(error instanceof $.ShellError) || attempt === maxTestAttempts) {
        throw error;
      }

      await agent(
        concat(
          "The project checks are failing. Fix the implementation and tests so that `bun run check` passes.",
          "",
          "Failing check output:",
          error.stdout.toString(),
          error.stderr.toString(),
        ),
        { cwd, model, instructions: agentInstructions },
      );
    }
  }
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
  const pwd = await getPwd(worktreePath);

  const report = await agent(prompt, {
    cwd: worktreePath,
    model,
    instructions: agentInstructions,
  });

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await runChecks(worktreePath, verbose);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  await $`git add --all`.cwd(worktreePath).quiet(!verbose);
  await $`git commit -m ${report.summary}`
    .cwd(worktreePath)
    .quiet(!verbose);
  await $`git push --set-upstream origin ${branchName}`
    .cwd(worktreePath)
    .quiet(!verbose);

  const pullRequestBody = concat(
    "## Summary",
    "",
    report.summary,
    "",
    "## Validation",
    "",
    "- `bun run check`",
  );
  const pullRequest =
    await $`gh pr create --head ${branchName} --title ${report.summary.slice(0, 120)} --body ${pullRequestBody}`
      .cwd(worktreePath)
      .quiet();
  const pullRequestUrl = pullRequest.stdout.toString().trim();

  await $`git worktree remove ${worktreePath}`.quiet(!verbose);

  return pullRequestUrl;
});
