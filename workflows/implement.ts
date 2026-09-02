import { $ as bunShell } from "bun";
import {
  agent,
  cli,
  concat,
  createShell,
  getPwd,
  type Shell,
  workflow,
} from "../src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

export interface ImplementOptions {
  cwd?: string;
  verbose?: boolean;
}

async function runChecks(cwd: string, shell: Shell) {
  for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
    try {
      await shell`bun run check`.cwd(cwd);
      return;
    } catch (error) {
      if (
        !(error instanceof bunShell.ShellError) ||
        attempt === maxTestAttempts
      ) {
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

export async function implement(
  prompt: string,
  options: ImplementOptions = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const verbose = options.verbose ?? false;
  const shell = createShell({ verbose });

  const pwd = await getPwd(cwd);

  const report = await agent(prompt, {
    cwd,
    model,
    instructions: agentInstructions,
  });

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await runChecks(cwd, shell);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  return report.summary;
}

if (import.meta.main) {
  await workflow(async () => {
    const { prompt, verbose } = cli();
    return implement(prompt, { verbose });
  });
}
