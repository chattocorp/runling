import type { Factory } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = ["Write tests for new or changed features."];
const maxValidationAttempts = 3;

function runCheck(f: Factory) {
  return f.shell`bun run check`.cwd(f.cwd).nothrow();
}

function runTests(f: Factory) {
  return f.shell`bun test`.cwd(f.cwd).nothrow();
}

async function validate(f: Factory) {
  const { cwd } = f;
  let attempt = 1;

  while (true) {
    f.log.info(`Running checks (attempt ${attempt}/${maxValidationAttempts})`);
    let result = await runCheck(f);

    if (result.exitCode === 0) {
      f.log.info(`Running tests (attempt ${attempt}/${maxValidationAttempts})`);
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

    f.log.info(
      `Fixing failed validation (attempt ${attempt}/${maxValidationAttempts})`,
    );

    await using repairAgent = await f.agent({
      cwd,
      model,
      thinkingLevel,
      instructions: agentInstructions,
    });

    await repairAgent.run(
      f.concat(
        "Project validation failed. Fix the implementation and tests so that both `bun run check` and `bun test` pass.",
        "",
        "Failure output:",
        result.stdout.toString(),
        result.stderr.toString(),
      ),
    );

    attempt++;
  }
}

export async function implement(f: Factory): Promise<string> {
  const { cwd } = f;

  const pwd = await f.getPwd(cwd);

  await using implementationAgent = await f.agent({
    cwd,
    model,
    thinkingLevel,
    instructions: agentInstructions,
  });

  const report = await implementationAgent.run(f.prompt);

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await validate(f);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  return report.summary;
}

export default implement;
