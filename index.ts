import {
  agent,
  cli,
  run,
  workflow,
  workingTreeHash,
} from "./src/index.ts";

await workflow(async () => {
  const { prompt } = cli();
  const statusBefore = await workingTreeHash();

  const report = await agent(prompt, {
    model: "openrouter/z-ai/glm-5.3-flash",
    instructions: ["Write tests for new or changed features."],
  });

  if (statusBefore !== (await workingTreeHash())) {
    await run("Running tests")`bun test`;
  }

  return report.summary;
});
