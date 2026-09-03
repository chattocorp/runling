import { workflow } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";

export const joke = workflow("Tell a joke", async (f): Promise<string> => {
  const topic = await f.input("What should the joke be about?");

  const result = await f.step("Write joke", () =>
    f.runAgent(`Write one genuinely funny joke about ${JSON.stringify(topic)}.`, {
      model,
      thinkingLevel: "low",
      tools: [],
      instructions: [
        "Return only the joke, with no introduction or explanation.",
        "Put the complete joke in the report details.",
      ],
    }),
  );

  return `# Joke\n\n${result.details ?? result.summary}`;
});

export default joke;
