import type { Factory } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = ["Write tests for new or changed features."];
const maxValidationAttempts = 3;

const runCheck = (f: Factory) =>
  f.step(
    f.esperanto ? "Rulante kontrolojn" : "Running checks",
    () => f.shell`bun run check`.nothrow(),
  );

const runTests = (f: Factory) =>
  f.step(
    f.esperanto ? "Rulante testojn" : "Running tests",
    () => f.shell`bun test`.nothrow(),
  );

async function validate(f: Factory) {
  const { cwd } = f;
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
          f.esperanto
            ? `Projekta validigo malsukcesis post ${maxValidationAttempts} provoj.`
            : `Project validation failed after ${maxValidationAttempts} attempts.`,
          result.stdout.toString(),
          result.stderr.toString(),
        ),
      );
    }

    f.log.info(
      f.esperanto
        ? `Riparante malsukcesan validigon (provo ${attempt}/${maxValidationAttempts})`
        : `Fixing failed validation (attempt ${attempt}/${maxValidationAttempts})`,
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
    throw new Error(
      f.esperanto
        ? "La aganto finis sen ŝanĝi la laborarbon"
        : "Agent completed without changing the worktree",
    );
  }

  await validate(f);
  if (!(await pwd.hasChanges)) {
    throw new Error(
      f.esperanto
        ? "La validigita laborarbo ne plu enhavas ŝanĝojn"
        : "The validated worktree no longer contains any changes",
    );
  }

  return report.summary;
}

export default implement;
