import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { FactoryError } from "./errors.ts";
import { log } from "./log.ts";
import { parseModelReference } from "./model.ts";
import { displayPath, displayText } from "./paths.ts";
import {
  FACTORY_SYSTEM_PROMPT,
  formatAgentInstructions,
} from "./system-prompt.ts";
import { containsMalformedToolCall, toSingleLine } from "./text.ts";

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

export interface RunAgentOptions {
  model: string;
  instructions?: readonly string[];
}

export function requireCompletedReport(
  report: AgentReport | undefined,
): AgentReport {
  if (report === undefined) {
    throw new FactoryError("Agent finished without a valid outcome report", 2);
  }

  if (report.outcome !== "completed") {
    throw new FactoryError(report.summary);
  }

  return report;
}

export async function agent(
  prompt: string,
  options: RunAgentOptions,
): Promise<AgentReport> {
  return requireCompletedReport(await runAgent(prompt, options));
}

const toolEmojis: Record<string, string> = {
  read: "📖",
  edit: "✏️",
  write: "📝",
  bash: "🐚",
  report_outcome: "📋",
};

export function describeTool(name: string, args: Record<string, unknown>) {
  const emoji = toolEmojis[name] ?? "🔧";
  switch (name) {
    case "read":
      return `${emoji} Reading ${displayPath(String(args.path))}`;
    case "edit":
      return `${emoji} Editing ${displayPath(String(args.path))}`;
    case "write":
      return `${emoji} Writing ${displayPath(String(args.path))}`;
    case "bash":
      return `${emoji} Running ${displayText(String(args.command).replaceAll("\n", " "))}`;
    default:
      return `${emoji} Using ${name}`;
  }
}

export async function runAgent(
  prompt: string,
  options: RunAgentOptions,
): Promise<AgentReport | undefined> {
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
  const modelReference = parseModelReference(options.model);
  const model = modelRuntime.getModel(modelReference.provider, modelReference.id);

  if (model === undefined) {
    throw new Error(`Model ${options.model} is unavailable`);
  }

  const additionalInstructions = formatAgentInstructions(
    options.instructions ?? [],
  );

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    appendSystemPromptOverride: (base) => [
      ...base,
      FACTORY_SYSTEM_PROMPT,
      ...(additionalInstructions === undefined ? [] : [additionalInstructions]),
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
      log.info(`Agent started (model: ${model.provider}/${model.id})`);
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
      log.debug("Discarding final text: it still looks like a malformed tool call");
      return undefined;
    }

    return {
      outcome: "completed",
      summary: toSingleLine(finalText),
    };
  }

  log.debug("Agent produced neither an outcome report nor usable final text");
  return undefined;
}
