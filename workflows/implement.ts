import {
  workflow,
  type FactoryRuntime,
  type FactoryWorkflow,
  type Shell,
  type WorkflowInvocation,
} from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";
const thinkingLevel = "medium";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

const runChecks = workflow(
  "Quality Assurance",
  async (factory: FactoryRuntime, cwd: string, shell: Shell) => {
    const { agent, concat, log, ShellError, withRetries } = factory;

    await withRetries(
      maxTestAttempts,
      async ({ attempt, attempts }) => {
        log.info(`Running tests (attempt ${attempt}/${attempts})`);
        await shell`bun run check`.cwd(cwd);
      },
      async ({ attempt, attempts, error }) => {
        if (!(error instanceof ShellError)) {
          throw error;
        }

        log.info(`Fixing failing tests (attempt ${attempt}/${attempts})`);
        await agent(
          concat(
            "The project checks are failing. Fix the implementation and tests so that `bun run check` passes.",
            "",
            "Failing check output:",
            error.stdout.toString(),
            error.stderr.toString(),
          ),
          { cwd, model, thinkingLevel, instructions: agentInstructions },
        );
      },
    );
  },
);

export const implement = workflow(
  "Implement requested change",
  async (
    factory: FactoryRuntime,
    { cwd, prompt, verbose }: WorkflowInvocation,
  ): Promise<string> => {
    const { agent, createShell, getPwd } = factory;
    const $ = createShell({ verbose });

    const pwd = await getPwd(cwd);

    const report = await agent(prompt, {
      cwd,
      model,
      thinkingLevel,
      instructions: agentInstructions,
    });

    if (!(await pwd.hasChanges)) {
      throw new Error("Agent completed without changing the worktree");
    }

    await runChecks(factory, cwd, $);
    if (!(await pwd.hasChanges)) {
      throw new Error("The validated worktree no longer contains any changes");
    }

    return report.summary;
  },
);

export default implement satisfies FactoryWorkflow;
