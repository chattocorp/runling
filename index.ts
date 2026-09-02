import {
  agent,
  cli,
  concat,
  FactoryError,
  getPwd,
  run,
  withRetries,
  workflow,
} from "./src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runTests() {
  await withRetries(
    maxTestAttempts,
    async (attempt) => {
      const tests = await run(
        `Running tests (attempt ${attempt}/${maxTestAttempts})`,
      )`bun test`;

      if (tests.exitCode === 0) {
        return;
      }

      const output = concat(
        tests.stdout.toString(),
        tests.stderr.toString(),
      ).trim();

      throw new FactoryError(
        concat(
          `Tests failed (attempt ${attempt}/${maxTestAttempts})`,
          output,
        ).trim(),
        3,
      );
    },
    async (error) => {
      await agent(
        concat(
          "The test suite is failing. Fix the implementation and tests so that `bun test` passes.",
          "",
          "Failing test output:",
          error instanceof Error ? error.message : String(error),
        ),
        { model, instructions: agentInstructions },
      );
    },
  );
}

async function implement(prompt: string) {
  return agent(prompt, {
    model,
    instructions: agentInstructions,
  });
}

await workflow(async () => {
  const { prompt } = cli();
  const pwd = await getPwd();

  const report = await implement(prompt);

  if (await pwd.changed) {
    await runTests();
  }

  return report.summary;
});
