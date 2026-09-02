import {
  agent,
  cli,
  FactoryError,
  run,
  workflow,
  workingTreeHash,
} from "./src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runTests() {
  for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
    const tests = await run.check(
      `Running tests (attempt ${attempt}/${maxTestAttempts})`,
    )`bun test`;

    if (tests.exitCode === 0) {
      return;
    }

    const output = [tests.stdout.toString(), tests.stderr.toString()]
      .filter((text) => text.trim() !== "")
      .join("\n")
      .trim();

    if (attempt === maxTestAttempts) {
      throw new FactoryError(
        `Tests still failing after ${maxTestAttempts} attempts\n${output}`,
        3,
      );
    }

    await agent(
      [
        "The test suite is failing. Fix the implementation and tests so that `bun test` passes.",
        "",
        "Failing test output:",
        output,
      ].join("\n"),
      { model, instructions: agentInstructions },
    );
  }
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
