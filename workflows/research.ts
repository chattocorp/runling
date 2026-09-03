import { workflow, type WorkflowResult } from "../src/index.ts";

const model = "openai-codex/gpt-5.6-sol";

export const research = workflow(
  "Research topic",
  async (f): Promise<WorkflowResult> => {
    const topic =
      f.prompt.trim() === ""
        ? await f.input("What topic should I research?")
        : f.prompt;

    const report = await f.step("Researching topic", () =>
      f.runAgent(
        f.concat(
          "Research the following topic using the web_fetch tool:",
          topic,
          "",
          "Consult multiple relevant sources, reconcile material disagreements, and distinguish sourced facts from your own synthesis.",
          "If you do not know suitable source URLs, begin by fetching a public search-results page.",
        ),
        {
          model,
          thinkingLevel: "medium",
          tools: ["web_fetch"],
          instructions: [
            "Base the report on information retrieved with web_fetch during this run.",
            "Prefer primary and authoritative sources when available.",
            "Put a concise conclusion in the report summary.",
            "Put the complete Markdown research report in the report details, with source links next to the claims they support.",
          ],
        },
      ),
    );

    const research = report.details ?? report.summary;
    return {
      summary: report.summary,
      details: report.details,
      outputs: { research },
    };
  },
);

export default research;
