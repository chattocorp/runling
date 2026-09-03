import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
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

const AGENT_COLORS = [
  "#f59f00",
  "#40c057",
  "#15aabf",
  "#4c6ef5",
  "#ae3ec9",
  "#e64980",
  "#f76707",
  "#12b886",
] as const;
const MIN_AGENT_RETRIES = 5;
let nextAgentColor = 0;

function takeAgentColor(): string {
  const color = AGENT_COLORS[nextAgentColor % AGENT_COLORS.length]!;
  nextAgentColor++;
  return color;
}

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

/**
 * Reasoning effort for models that support extended thinking. "xhigh" and
 * "max" are only supported by selected model families.
 */
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface RunAgentOptions {
  model: string;
  /** Reasoning effort for the model. Defaults to pi's own settings default. */
  thinkingLevel?: ThinkingLevel;
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
  const agentId = randomId();
  const color = takeAgentColor();
  return log.withColor(color, () =>
    runAgentSession(agentId, color, prompt, options),
  );
}

async function runAgentSession(
  agentId: string,
  color: string,
  prompt: string,
  options: RunAgentOptions,
): Promise<AgentResult> {
  options.signal?.throwIfAborted();

  const prefixLog = (message: string) =>
    `${log.colorize(`[${agentId}]`)} ${message}`;
  const agentLog = {
    debug: (message: string) =>
      log.withColor(color, () => log.debug(prefixLog(message))),
    error: (message: string) =>
      log.withColor(color, () => log.error(prefixLog(message))),
    info: (message: string) =>
      log.withColor(color, () => log.info(prefixLog(message))),
    success: (message: string) =>
      log.withColor(color, () => log.success(prefixLog(message))),
  };
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
  const agentDir = options.resources?.agentDir ?? getAgentDir();
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
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const retrySettings = settingsManager.getRetrySettings();
  settingsManager.applyOverrides({
    retry: {
      ...retrySettings,
      maxRetries: Math.max(retrySettings.maxRetries, MIN_AGENT_RETRIES),
    },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
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
    thinkingLevel: options.thinkingLevel,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
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
      agentLog.info(`Agent started (model: ${model.provider}/${model.id})`);
    }

    if (
      event.type === "tool_execution_start" &&
      event.toolName !== "report_outcome"
    ) {
      agentLog.info(describeTool(event.toolName, event.args));
    }

    if (event.type === "tool_execution_end" && event.isError) {
      agentLog.error(`${event.toolName} failed`);
    }

    if (event.type === "auto_retry_start") {
      agentLog.info(
        `Retrying agent in ${formatDelay(event.delayMs)} ` +
          `(attempt ${event.attempt}/${event.maxAttempts}): ${toSingleLine(event.errorMessage)}`,
      );
    }

    if (event.type === "auto_retry_end") {
      if (event.success) {
        agentLog.success(
          `Agent recovered after ${formatAttempts(event.attempt)}`,
        );
      } else {
        agentLog.error(
          `Agent retry failed after ${formatAttempts(event.attempt)}: ${toSingleLine(event.finalError ?? "Unknown error")}`,
        );
      }
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      finalText = event.message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");

      accumulateTokenUsage(usage, event.message.usage);
      agentLog.debug(`Tokens: ${formatTokenUsage(usage)}`);
    }
  });

  const abort = () => {
    void session.abort().catch((error) => {
      agentLog.error(
        `Failed to abort agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    options.signal?.throwIfAborted();
    await session.prompt(prompt);
    options.signal?.throwIfAborted();

    if (report === undefined) {
      agentLog.info(
        finalText !== undefined && containsMalformedToolCall(finalText)
          ? "Retrying malformed outcome report"
          : "Retrying missing outcome report",
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

  agentLog.info(`Token usage: ${formatTokenUsage(usage)}`);
  recordTokenUsage(usage);

  if (report !== undefined) {
    return { ...report, usage };
  }

  if (finalText !== undefined && finalText.trim() !== "") {
    agentLog.debug(
      `Discarding unreported final text: ${toSingleLine(finalText)}`,
    );
  }

  return {
    outcome: "failed",
    summary: "Agent finished without a valid outcome report",
    usage,
  };
}

function formatDelay(delayMs: number): string {
  return delayMs % 1000 === 0 ? `${delayMs / 1000}s` : `${delayMs}ms`;
}

function formatAttempts(attempts: number): string {
  return `${attempts} retry ${attempts === 1 ? "attempt" : "attempts"}`;
}
