import { $ } from "bun";
import { agent, cli, concat, getPwd, workflow } from "./src/index.ts";

const model = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];
const maxTestAttempts = 3;

async function runTests() {
  for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
    try {
      await $`bun test`;
      return;
    } catch (error) {
      if (!(error instanceof $.ShellError) || attempt === maxTestAttempts) {
        throw error;
      }

      await agent(
        concat(
          "The test suite is failing. Fix the implementation and tests so that `bun test` passes.",
          "",
          "Failing test output:",
          error.stdout.toString(),
          error.stderr.toString(),
        ),
        { model, instructions: agentInstructions },
      );
    }
  }
}

await workflow(async () => {
  const { prompt } = cli();
  const pwd = await getPwd();

  const report = await agent(prompt, {
    model,
    instructions: agentInstructions,
  });

  if (await pwd.hasChanges) {
    await runTests();
  }

  return report.summary;
});
