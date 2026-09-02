import type {
  FactoryRuntime,
  FactoryWorkflow,
  Shell,
  WorkflowInvocation,
} from "../src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runChecks(factory: FactoryRuntime, cwd: string, shell: Shell) {
  const { agent, concat, log, ShellError, step } = factory;

  await step("QA", async () => {
    for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
      try {
        log.info(`Running tests (attempt ${attempt}/${maxTestAttempts})`);
        await shell`bun run check`.cwd(cwd);
        return;
      } catch (error) {
        if (!(error instanceof ShellError) || attempt === maxTestAttempts) {
          throw error;
        }

        log.info(`Fixing failing tests (attempt ${attempt}/${maxTestAttempts})`);
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
  });
}

export async function implement(
  factory: FactoryRuntime,
  { cwd, prompt, verbose }: WorkflowInvocation,
): Promise<string> {
  const { agent, createShell, getPwd, step } = factory;
  const $ = createShell({ verbose });

  const pwd = await getPwd(cwd);

  const report = await step("Implementing requested change", () =>
    agent(prompt, {
      cwd,
      model,
      instructions: agentInstructions,
    }),
  );

  if (!(await pwd.hasChanges)) {
    throw new Error("Agent completed without changing the worktree");
  }

  await runChecks(factory, cwd, $);
  if (!(await pwd.hasChanges)) {
    throw new Error("The validated worktree no longer contains any changes");
  }

  return report.summary;
}

export default implement satisfies FactoryWorkflow;
