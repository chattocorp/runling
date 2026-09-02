import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { log } from "./log.ts";
import { FACTORY_SYSTEM_PROMPT } from "./system-prompt.ts";

const reportSchema = Type.Object({
  outcome: Type.Union([
    Type.Literal("completed"),
    Type.Literal("blocked"),
    Type.Literal("failed"),
  ]),
  summary: Type.String({
    description: "A concise, single-line summary of the outcome",
  }),
});

export type AgentReport = Static<typeof reportSchema>;

function describeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "read":
      return `Reading ${args.path}`;
    case "edit":
      return `Editing ${args.path}`;
    case "write":
      return `Writing ${args.path}`;
    case "bash":
      return `Running ${String(args.command).replaceAll("\n", " ")}`;
    default:
      return `Using ${name}`;
  }
}

function summarize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function containsMalformedToolCall(text: string) {
  return /functions\.[\w-]+:\d+\s*\{/.test(text);
}

export async function runAgent(prompt: string): Promise<AgentReport | undefined> {
  let report: AgentReport | undefined;
  let finalText: string | undefined;

  const reportOutcome = defineTool({
    name: "report_outcome",
    label: "Report outcome",
    description: "Report the final outcome of the task and terminate the run.",
    promptSnippet: "Report the task outcome as structured data",
    promptGuidelines: [
      "Always call report_outcome as your final action.",
      "Do not finish with a plain-text assistant response.",
    ],
    parameters: reportSchema,
    async execute(_toolCallId, params) {
      report = params;
      return {
        content: [{ type: "text" as const, text: "Outcome recorded." }],
        details: params,
        terminate: true,
      };
    },
  });

  const modelRuntime = await ModelRuntime.create();
  const model = modelRuntime.getModel(
    "openrouter",
    "anthropic/claude-haiku-4.5",
  );

  if (model === undefined) {
    throw new Error("Model openrouter/anthropic/claude-haiku-4.5 is unavailable");
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    appendSystemPromptOverride: (base) => [
      ...base,
      FACTORY_SYSTEM_PROMPT,
    ],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    customTools: [reportOutcome],
    tools: ["read", "bash", "edit", "write", "report_outcome"],
  });

  session.subscribe((event) => {
    if (event.type === "agent_start") {
      log.info("Agent started");
    }

    if (
      event.type === "tool_execution_start" &&
      event.toolName !== "report_outcome"
    ) {
      log.info(describeTool(event.toolName, event.args));
    }

    if (event.type === "tool_execution_end" && event.isError) {
      log.error(`${event.toolName} failed`);
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      finalText = event.message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
    }
  });

  try {
    await session.prompt(prompt);

    if (
      report === undefined &&
      finalText !== undefined &&
      containsMalformedToolCall(finalText)
    ) {
      log.info("Retrying malformed tool call");
      finalText = undefined;
      await session.prompt(
        "Continue the original task. Your previous response encoded a tool call as plain text. Use native tool calling and finish the task.",
      );
    }
  } finally {
    session.dispose();
  }

  if (report !== undefined) {
    return report;
  }

  if (finalText !== undefined && finalText.trim() !== "") {
    if (containsMalformedToolCall(finalText)) {
      return undefined;
    }

    return {
      outcome: "completed",
      summary: summarize(finalText),
    };
  }
}
