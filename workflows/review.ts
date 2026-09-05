import { workflow, type WorkflowResult } from "factory";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const perspectives = [
  {
    name: "correctness",
    prompt:
      "Review the change for correctness, regressions, edge cases, and unsafe behavior.",
  },
  {
    name: "testing",
    prompt:
      "Review the change's test coverage, including missing cases and fragile assertions.",
  },
  {
    name: "simplicity",
    prompt:
      "Review the change for unnecessary complexity, awkward APIs, and opportunities to use simpler standard TypeScript.",
  },
] as const;

export const review = workflow("Review", async (f): Promise<WorkflowResult> => {
  const status = await f.shell`git status --short`.text();
  if (status.trim() === "") return { summary: "No changes to review" };

  const diff =
    await f.shell`git diff HEAD --stat --patch --no-ext-diff`.text();

  await using orchestrator = await f.agent({
    model,
    thinkingLevel,
    tools: ["read", "grep", "find", "ls", "web_fetch"],
    instructions: [
      "Inspect the repository without modifying it.",
      "Put substantial review findings and rationale in report details.",
    ],
  });

  await f.step("Investigate change", () =>
    orchestrator.run(
      f.concat(
        "Build a factual understanding of the current working-tree change for several focused reviewers.",
        "Do not modify the repository.",
        f.prompt === "" ? [] : ["", "Requested focus:", f.prompt],
        "",
        "Git status:",
        status,
        "",
        "Diff:",
        diff,
      ),
    ),
  );

  const reviewResults = await Promise.allSettled(
    perspectives.map(async ({ name, prompt }) => {
      await using reviewer = await orchestrator.fork();
      return await f.step(`Review ${name}`, () => reviewer.run(prompt));
    }),
  );

  const failedReviews = reviewResults.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedReviews.length === 1) throw failedReviews[0]!.reason;
  if (failedReviews.length > 0) {
    throw new AggregateError(
      failedReviews.map(({ reason }) => reason),
      `${failedReviews.length} review ${failedReviews.length === 1 ? "agent" : "agents"} failed`,
    );
  }

  const reviews = reviewResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  const report = await f.step("Synthesize review", () =>
    orchestrator.run(
      f.concat(
        "Synthesize the focused reports below into one concise code review.",
        "Report only concrete, actionable findings, ordered by severity. Say clearly when no issues were found.",
        "Use report details for the complete Markdown review.",
        "",
        reviews.map((review, index) =>
          f.concat(
            `## ${perspectives[index]!.name}`,
            review.summary,
            review.details ?? "",
          ),
        ),
      ),
    ),
  );

  return {
    summary: report.summary,
    details: report.details,
    outputs: { review: report.details ?? report.summary },
  };
});

export default review;
