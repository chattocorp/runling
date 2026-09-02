import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { randomId } from "./id.ts";
import { log } from "./log.ts";
import { parseModelReference } from "./model.ts";
import { displayPath, displayText } from "./paths.ts";
import {
  FACTORY_SYSTEM_PROMPT,
  formatAgentInstructions,
} from "./system-prompt.ts";
import { containsMalformedToolCall, toSingleLine } from "./text.ts";
import {
  accumulateTokenUsage,
  emptyTokenUsage,
  formatTokenUsage,
  recordTokenUsage,
  type TokenUsage,
} from "./usage.ts";

const reportSchema = Type.Object({
  outcome: Type.Union([
    Type.Literal("completed"),
    Type.Literal("blocked"),
    Type.Literal("failed"),
  ]),
  summary: Type.String({
    description: "A concise, single-line summary of the outcome",
    minLength: 1,
    maxLength: 500,
    pattern: "^[^\\r\\n]+$",
  }),
});

export type AgentReport = Static<typeof reportSchema>;
/** A report enriched with the token usage of the agent interaction. */
export type AgentResult = AgentReport & { usage: TokenUsage };
export type CompletedAgentReport = AgentResult & { outcome: "completed" };

export interface AgentResourceOptions {
  /** Directory containing global pi configuration and resources. */
  agentDir?: string;
  extensions?: boolean;
  skills?: boolean;
  promptTemplates?: boolean;
  themes?: boolean;
  contextFiles?: boolean;
}

export interface RunAgentOptions {
  model: string;
  instructions?: readonly string[];
  cwd?: string;
  /** Built-in and extension tools to expose. `report_outcome` is always added. */
  tools?: readonly string[];
  resources?: AgentResourceOptions;
  /** Abort an active model turn. */
  signal?: AbortSignal;
}

export class AgentOutcomeError extends Error {
  override readonly name = "AgentOutcomeError";

  constructor(readonly report: AgentResult) {
    super(report.summary);
  }
}

export function requireCompletedReport(
  report: AgentResult,
): CompletedAgentReport {
  if (report.outcome !== "completed") {
    throw new AgentOutcomeError(report);
  }

  return report as CompletedAgentReport;
}

export async function agent(
  prompt: string,
  options: RunAgentOptions,
): Promise<CompletedAgentReport> {
  return requireCompletedReport(await runAgent(prompt, options));
}

export function describeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "read":
      return `Reading ${displayPath(String(args.path))}`;
    case "edit":
      return `Editing ${displayPath(String(args.path))}`;
    case "write":
      return `Writing ${displayPath(String(args.path))}`;
    case "bash":
      return `Running ${displayText(String(args.command).replaceAll("\n", " "))}`;
    default:
      return `Using ${name}`;
  }
}

export async function runAgent(
  prompt: string,
  options: RunAgentOptions,
): Promise<AgentResult> {
  options.signal?.throwIfAborted();

  const agentId = randomId();
  const prefixLog = (message: string) => `[${agentId}] ${message}`;
  let report: AgentReport | undefined;
  let finalText: string | undefined;
  const usage = emptyTokenUsage();

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

  const cwd = options.cwd ?? process.cwd();
  const modelRuntime = await ModelRuntime.create();
  const modelReference = parseModelReference(options.model);
  const model = modelRuntime.getModel(modelReference.provider, modelReference.id);

  if (model === undefined) {
    throw new Error(`Model ${options.model} is unavailable`);
  }

  const additionalInstructions = formatAgentInstructions(
    options.instructions ?? [],
  );

  const resources = options.resources;
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: resources?.agentDir ?? getAgentDir(),
    noExtensions: resources?.extensions === false,
    noSkills: resources?.skills === false,
    noPromptTemplates: resources?.promptTemplates === false,
    noThemes: resources?.themes === false,
    noContextFiles: resources?.contextFiles === false,
    appendSystemPromptOverride: (base) => [
      ...base,
      FACTORY_SYSTEM_PROMPT,
      ...(additionalInstructions === undefined ? [] : [additionalInstructions]),
    ],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    model,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    customTools: [reportOutcome],
    tools: [
      ...new Set([
        ...(options.tools ?? ["read", "bash", "edit", "write"]),
        "report_outcome",
      ]),
    ],
  });

  session.subscribe((event) => {
    if (event.type === "agent_start") {
      log.info(
        prefixLog(`Agent started (model: ${model.provider}/${model.id})`),
      );
    }

    if (
      event.type === "tool_execution_start" &&
      event.toolName !== "report_outcome"
    ) {
      log.info(prefixLog(describeTool(event.toolName, event.args)));
    }

    if (event.type === "tool_execution_end" && event.isError) {
      log.error(prefixLog(`${event.toolName} failed`));
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      finalText = event.message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");

      accumulateTokenUsage(usage, event.message.usage);
      log.debug(prefixLog(`Tokens: ${formatTokenUsage(usage)}`));
    }
  });

  const abort = () => {
    void session.abort().catch((error) => {
      log.error(
        prefixLog(
          `Failed to abort agent: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
  };

  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    options.signal?.throwIfAborted();
    await session.prompt(prompt);
    options.signal?.throwIfAborted();

    if (report === undefined) {
      log.info(
        prefixLog(
          finalText !== undefined && containsMalformedToolCall(finalText)
            ? "Retrying malformed outcome report"
            : "Retrying missing outcome report",
        ),
      );
      finalText = undefined;
      await session.prompt(
        "Finish the original task by calling report_outcome with the truthful outcome. Use native tool calling; do not respond with plain text.",
      );
      options.signal?.throwIfAborted();
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    session.dispose();
  }

  log.info(prefixLog(`Token usage: ${formatTokenUsage(usage)}`));
  recordTokenUsage(usage);

  if (report !== undefined) {
    return { ...report, usage };
  }

  if (finalText !== undefined && finalText.trim() !== "") {
    log.debug(
      prefixLog(`Discarding unreported final text: ${toSingleLine(finalText)}`),
    );
  }

  return {
    outcome: "failed",
    summary: "Agent finished without a valid outcome report",
    usage,
  };
}
