import { workflow } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = [
  "Write tests for new or changed features.",
  "Summarize what you changed and why in your final report.",
];
const maxValidationAttempts = 3;

const runCheck = workflow("Run checks", (f) =>
  f.shell`bun run check`.nothrow(),
);

const runTests = workflow("Run tests", (f) => f.shell`bun test`.nothrow());

const validate = workflow("Validate", async (f) => {
  const check = await runCheck(f);
  return check.exitCode === 0 ? runTests(f) : check;
});

export const implement = workflow("Implement", async (f): Promise<string> => {
  const pwd = await f.getPwd();

  await using implementationAgent = await f.agent({
    model,
    thinkingLevel,
    instructions: agentInstructions,
  });

  await f.step("Implementing change", () => implementationAgent.run(f.prompt));

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  let validation = await validate(f);
  for (let attempt = 1; validation.exitCode !== 0; attempt++) {
    if (attempt === maxValidationAttempts) {
      throw new Error(
        `Project validation failed after ${maxValidationAttempts} attempts.\n${validation.stdout}\n${validation.stderr}`,
      );
    }

    await f.step(
      `Repairing validation (attempt ${attempt}/${maxValidationAttempts})`,
      () =>
        implementationAgent.run(
          f.concat(
            "Project validation failed. Fix the implementation and tests so that both `bun run check` and `bun test` pass.",
            "",
            "Failure output:",
            validation.stdout.toString(),
            validation.stderr.toString(),
          ),
        ),
    );

    validation = await validate(f);
  }

  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  const finalReport = await f.step("Summarizing changes", () =>
    implementationAgent.run(
      "Inspect the final working-tree diff, including any validation repairs, and summarize what changed and why. Do not modify the worktree.",
    ),
  );

  return finalReport.summary;
});

export default implement;
