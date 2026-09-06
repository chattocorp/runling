import { concat, Type, workflow } from "runling";

const model = "openai-codex/gpt-5.6-sol";

export const ask = workflow(
  {
    name: "Answer repository question",
    input: Type.String({ description: "A question about the repository" }),
    output: Type.Object({
      summary: Type.String(),
      details: Type.Optional(Type.String()),
      outputs: Type.Object({ answer: Type.String() }),
    }),
  },
  async (f, input) => {
    const question =
      input.trim() === ""
        ? await f.input("What would you like to know about the repository?")
        : input;

    const report = await f.step("Investigating repository", () =>
      f.runAgent(
        concat(
          "Answer this question about the repository:",
          question,
          "",
          "Inspect the repository before answering. Ground the answer in the current files rather than assumptions.",
        ),
        {
          model,
          thinkingLevel: "medium",
          tools: ["read", "grep", "find", "ls"],
          instructions: [
            "Inspect the repository without modifying it.",
            "Answer only from evidence available in the repository.",
            "Put a concise direct answer in the report summary.",
            "Put supporting explanation in the report details, citing relevant file paths and line numbers.",
            "State clearly when the repository does not contain enough information to answer part of the question.",
          ],
        },
      ),
    );

    const answer = report.details ?? report.summary;
    return {
      summary: report.summary,
      details: report.details,
      outputs: { answer },
    };
  },
);

export default ask;
