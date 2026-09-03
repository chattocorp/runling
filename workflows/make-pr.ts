import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Factory, WorkflowResult } from "../src/index.ts";
import { implement } from "./implement.ts";

const worktreesDirectory = "../factory-worktrees";
const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";

export async function describePullRequest(
  f: Factory,
  implementationSummary: string,
) {
  return f.step("Writing pull request description", async () => {
    await using writer = await f.agent({
      model,
      thinkingLevel,
      tools: ["read", "bash"],
      instructions: ["Inspect the repository without modifying it."],
    });

    const report = await writer.run(
      f.concat(
        "Write the title and Markdown description for a pull request containing the current commit.",
        "Inspect the commit and its diff with git before writing the description.",
        "Use your report summary as the concise pull request title and report details as the complete Markdown body.",
        "Mention that `bun run check` and `bun test` passed.",
        "",
        "Implementation summary:",
        implementationSummary,
      ),
    );

    return {
      title: report.summary.slice(0, 120),
      body: report.details ?? implementationSummary,
    };
  });
}

async function makePullRequest(f: Factory): Promise<WorkflowResult> {
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
  const implementationSummary = await implement(worktree);

  await worktree.shell`git add --all`;
  await worktree.shell`git commit -m ${implementationSummary}`;

  const pullRequest = await describePullRequest(
    worktree,
    implementationSummary,
  );
  await worktree.shell`git push --set-upstream origin ${branchName}`;
  const createdPullRequest =
    await worktree.shell`gh pr create --head ${branchName} --title ${pullRequest.title} --body ${pullRequest.body}`.quiet();
  const pullRequestUrl = createdPullRequest.stdout.toString().trim();

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
