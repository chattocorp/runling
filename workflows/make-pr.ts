import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { concat, randomId, Type, workflow, type Runling, type WorkflowResult } from "runling";
import { implement } from "./implement.ts";
import { review } from "./review.ts";

const worktreesDirectory = "../runling-worktrees";
const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";

// Ground generated PR copy in both the agent's intent and the committed diff.
export const describePullRequest = (
  f: Runling,
  implementationSummary: string,
  committedChange: string,
) => f.step("Describe pull request", async () => {
    await using writer = await f.agent({
      model,
      thinkingLevel,
      tools: ["read", "grep", "find", "ls"],
      instructions: ["Inspect the repository without modifying it."],
    });

    const report = await writer.run(
      concat(
        "Write the title and Markdown description for a pull request containing the current commit.",
        "Use the supplied commit and diff, inspecting repository files when useful.",
        "Use your report summary as the concise pull request title and report details as the complete Markdown body.",
        "Mention that `pnpm run check` and `pnpm test` passed.",
        "",
        "Implementation summary:",
        implementationSummary,
        "",
        "Commit and diff:",
        committedChange,
      ),
    );

    return {
      title: report.summary.slice(0, 120),
      body: report.details ?? implementationSummary,
    };
  });

export const postReview = (
  f: Runling,
  pullRequestUrl: string,
  result: WorkflowResult,
) => f.step("Post review", async () => {
    const body = result.details ?? result.summary;
    await f.exec`gh pr comment ${pullRequestUrl} --body ${body}`;
  });

export const createWorktree = (
  f: Runling,
  branchName: string,
  worktreePath: string,
) => f.step("Create worktree", async () => {
    // Ask GitHub instead of assuming the default branch is named main.
    const baseBranch = (
      await f.exec`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.text()
    ).trim();
    if (baseBranch === "") {
      throw new Error("GitHub did not report a default branch");
    }

    await f.exec`git fetch origin +refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`;
    await f.exec`git worktree add -b ${branchName} ${worktreePath} origin/${baseBranch}`;
  });

const makePullRequest = workflow(
  {
    name: "Make pull request",
    input: Type.String({ description: "The requested code change" }),
    output: Type.Object({
      summary: Type.String(),
      outputs: Type.Object({
        branchName: Type.String(),
        pullRequestUrl: Type.String(),
      }),
    }),
  },
  async (f, input) => {
    const { cwd } = f;
    await f.exec`gh auth status`;

    const worktreeId = randomId();
    const branchName = `runling/${worktreeId}`;
    const worktreesPath = resolve(cwd, worktreesDirectory);
    const worktreePath = resolve(worktreesPath, worktreeId);

    // Keep implementation work isolated from the caller's checkout.
    await mkdir(worktreesPath, { recursive: true });
    await createWorktree(f, branchName, worktreePath);
    f.log.info(`Working in ${worktreePath}`);

    const worktree = { ...f, cwd: worktreePath, prompt: input };
    await worktree.exec`pnpm install --frozen-lockfile`;
    const implementationSummary = await implement(worktree, input);

    // Review the complete staged change before capturing it in a commit.
    await worktree.exec`git add --all`;
    const reviewResult = await review(worktree, "");
    await worktree.exec`git commit -m ${implementationSummary}`;

    // Describe exactly what will appear in the pull request.
    const committedChange =
      await worktree.exec`git show --format=fuller --stat --patch --no-ext-diff HEAD`.text();
    const pullRequest = await describePullRequest(
      worktree,
      implementationSummary,
      committedChange,
    );
    await worktree.exec`git push --set-upstream origin ${branchName}`;
    const createdPullRequest =
      await worktree.exec`gh pr create --head ${branchName} --title ${pullRequest.title} --body ${pullRequest.body}`.quiet();
    const pullRequestUrl = createdPullRequest.stdout.toString().trim();
    await postReview(worktree, pullRequestUrl, reviewResult);

    // Failed runs intentionally retain their worktree for inspection.
    await f.exec`git worktree remove ${worktreePath}`;

    return {
      summary: `Opened ${pullRequestUrl}`,
      outputs: {
        branchName,
        pullRequestUrl,
      },
    };
  },
);

export default makePullRequest;
