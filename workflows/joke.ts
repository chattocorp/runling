import { Type, workflow } from "factory";

const model = "openai-codex/gpt-5.6-sol";

export const joke = workflow(
  {
    name: "Tell a joke",
    input: Type.String({ description: "The subject of the joke" }),
    output: Type.String({ description: "The generated joke in Markdown" }),
  },
  async (f, input): Promise<string> => {
    const topic = input || (await f.input("What should the joke be about?"));

    const result = await f.step("Write joke", () =>
      f.runAgent(
        `Write one genuinely funny joke about ${JSON.stringify(topic)}.`,
        {
          model,
          thinkingLevel: "low",
          tools: [],
          instructions: [
            "Return only the joke, with no introduction or explanation.",
            "Put the complete joke in the report details.",
          ],
        },
      ),
    );

    return `# Joke\n\n${result.details ?? result.summary}`;
  },
);

export default joke;
