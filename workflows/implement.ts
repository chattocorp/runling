import type { Factory } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runChecks(f: Factory) {
  const { cwd } = f;
  const $ = f.createShell({ verbose: f.verbose });

  await f.withRetries(
    maxTestAttempts,
    async ({ attempt, attempts }) => {
      f.log.info(`Running tests (attempt ${attempt}/${attempts})`);
      await $`bun run check`.cwd(cwd);
    },
    async ({ attempt, attempts, error }) => {
      if (!(error instanceof f.ShellError)) {
        throw error;
      }

      f.log.info(`Fixing failing tests (attempt ${attempt}/${attempts})`);
      await f.agent(
        f.concat(
          "The project checks are failing. Fix the implementation and tests so that `bun run check` passes.",
          "",
          "Failing check output:",
          error.stdout.toString(),
          error.stderr.toString(),
        ),
        {
          cwd,
          model,
          thinkingLevel,
          instructions: agentInstructions,
        },
      );
    },
  );
}

export async function implement(f: Factory): Promise<string> {
  const { cwd } = f;

  const pwd = await f.getPwd(cwd);

  const report = await f.agent(f.prompt, {
    cwd,
    model,
    thinkingLevel,
    instructions: agentInstructions,
  });

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await runChecks(f);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  return report.summary;
}

export default implement;
