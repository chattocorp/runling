import type { Factory, FactoryAgent } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = [
  "Write tests for new or changed features.",
  "Summarize what you changed and why in your final report.",
];
const maxValidationAttempts = 3;

const runCheck = (f: Factory) =>
  f.step(
    "Running checks",
    () => f.shell`bun run check`.nothrow(),
  );

const runTests = (f: Factory) =>
  f.step(
    "Running tests",
    () => f.shell`bun test`.nothrow(),
  );

async function validate(f: Factory, agent: FactoryAgent) {
  let attempt = 1;

  while (true) {
    let result = await runCheck(f);

    if (result.exitCode === 0) {
      result = await runTests(f);
    }

    if (result.exitCode === 0) return;
    if (attempt === maxValidationAttempts) {
      throw new Error(
        f.concat(
          `Project validation failed after ${maxValidationAttempts} attempts.`,
          result.stdout.toString(),
          result.stderr.toString(),
        ),
      );
    }

    await f.step(
      `Repairing validation (attempt ${attempt}/${maxValidationAttempts})`,
      () =>
        agent.run(
          f.concat(
            "Project validation failed. Fix the implementation and tests so that both `bun run check` and `bun test` pass.",
            "",
            "Failure output:",
            result.stdout.toString(),
            result.stderr.toString(),
          ),
        ),
    );

    attempt++;
  }
}

export async function implement(f: Factory): Promise<string> {
  const pwd = await f.getPwd();

  await using implementationAgent = await f.agent({
    model,
    thinkingLevel,
    instructions: agentInstructions,
  });

  await f.step("Implementing change", () =>
    implementationAgent.run(f.prompt),
  );

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await validate(f, implementationAgent);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  const finalReport = await f.step("Summarizing changes", () =>
    implementationAgent.run(
      "Inspect the final working-tree diff, including any validation repairs, and summarize what changed and why. Do not modify the worktree.",
    ),
  );

  return finalReport.summary;
}

export default implement;
