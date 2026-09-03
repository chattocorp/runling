import { type FactoryWorkflow, workflow } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";

/** Generates and presents the joke that opens each workflow entrypoint. */
export const openingJoke = workflow("Generate opening joke", async (f) => {
  const report = await f.runAgent(
    "Generate one short, original programming joke. Put only the joke in the report summary.",
    {
      model,
      thinkingLevel: "low",
      tools: [],
      resources: {
        extensions: false,
        skills: false,
        promptTemplates: false,
        themes: false,
        contextFiles: false,
      },
    },
  );

  if (report.outcome !== "completed") throw new f.AgentOutcomeError(report);
  f.log.info(report.summary);
});

/** Adds the opening joke before an entrypoint's actual work. */
export const withOpeningJoke = (run: FactoryWorkflow): FactoryWorkflow =>
  async (f) => {
    await openingJoke(f);
    return await run(f);
  };
