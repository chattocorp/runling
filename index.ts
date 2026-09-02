import {
  agent,
  cli,
  concat,
  FactoryError,
  run,
  withRetries,
  workflow,
  workingTreeHash,
} from "./src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runTests() {
  await withRetries(maxTestAttempts, async (attempt) => {
    const tests = await run.check(
      `Running tests (attempt ${attempt}/${maxTestAttempts})`,
    )`bun test`;

    if (tests.exitCode === 0) {
      return;
    }

    const output = concat(tests.stdout.toString(), tests.stderr.toString()).trim();

    if (attempt < maxTestAttempts) {
      await agent(
        concat(
          "The test suite is failing. Fix the implementation and tests so that `bun test` passes.",
          "",
          "Failing test output:",
          output,
        ),
        { model, instructions: agentInstructions },
      );
    }

    throw new FactoryError(
      `Tests still failing after ${attempt} attempts\n${output}`,
      3,
    );
  });
}

async function implement(prompt: string) {
  return agent(prompt, {
    model,
    instructions: agentInstructions,
  });
}

await workflow(async () => {
  const { prompt } = cli();
  const treeBefore = await workingTreeHash();

  const report = await implement(prompt);

  if (treeBefore !== (await workingTreeHash())) {
    await runTests();
  }

  return report.summary;
});
