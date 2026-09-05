import { stripVTControlCharacters } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import webFetchExtension from "../extensions/web-fetch.ts";
import { emitFactoryEvent } from "./events.ts";
import { randomId } from "./id.ts";
import { log, withLogSource } from "./log.ts";
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
  details: Type.Optional(
    Type.String({
      description: "Optional detailed Markdown supporting the summary",
      minLength: 1,
      maxLength: 20_000,
    }),
  ),
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
const TOOL_ACTION_COLORS: Record<string, string> = {
  read: "#40c057",
  bash: "#ae3ec9",
  edit: "#f76707",
  write: "#15aabf",
};
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
/** A named or anonymous pi extension instantiated for one agent session. */
export type AgentExtension = InlineExtension;
/** The API available while configuring an agent-local extension. */
export type AgentExtensionAPI = ExtensionAPI;

/** Preserve contextual typing when declaring a reusable agent extension. */
export function defineAgentExtension(extension: AgentExtension): AgentExtension {
  return extension;
}

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
  /** Extensions instantiated only for this agent session. */
  extensions?: readonly AgentExtension[];
  /** Observe the raw pi event stream for this agent session. */
  onEvent?: (event: AgentSessionEvent) => void;
  /** Abort an active model turn. */
  signal?: AbortSignal;
}

export type AgentOptions = Omit<RunAgentOptions, "signal">;

export interface AgentRunOptions {
  /** Abort this model turn without disposing the agent. */
  signal?: AbortSignal;
}

export interface FactoryAgent extends AsyncDisposable {
  /** Human-friendly ID used to prefix this agent's log lines. */
  readonly id: string;
  /** Run one turn and require it to complete successfully. */
  run(prompt: string, options?: AgentRunOptions): Promise<CompletedAgentReport>;
  /** Run one turn and return any reported outcome. */
  runOutcome(prompt: string, options?: AgentRunOptions): Promise<AgentResult>;
  /** Create an independent in-memory agent with a copy of this conversation. */
  fork(): Promise<FactoryAgent>;
  /** Release the underlying in-memory session. */
  dispose(): void;
}

export class AgentOutcomeError extends Error {
  override readonly name = "AgentOutcomeError";

  constructor(readonly report: AgentResult) {
    super(report.summary);
  }
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

function highlightToolAction(tool: string, description: string): string {
  const separator = description.indexOf(" ");
  const color = TOOL_ACTION_COLORS[tool] ?? "white";
  if (separator === -1) return log.highlight(description, color);

  return `${log.highlight(description.slice(0, separator), color)}${description.slice(separator)}`;
}

export async function runAgent(
  prompt: string,
  options: RunAgentOptions,
): Promise<AgentResult> {
  const { signal, ...createOptions } = options;
  signal?.throwIfAborted();
  const instance = await agent(createOptions);

  try {
    return await instance.runOutcome(prompt, { signal });
  } finally {
    instance.dispose();
  }
}

export async function agent(options: AgentOptions): Promise<FactoryAgent> {
  return createFactoryAgent(options);
}

type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

async function createFactoryAgent(
  options: AgentOptions,
  initialize?: (session: AgentSession) => void,
): Promise<FactoryAgent> {
  const agentId = randomId();
  const color = takeAgentColor();

  const prefixLog = (message: string) =>
    `${log.colorize(`[${agentId}]`)} ${message}`;
  const writeAgentLog = (
    level: "debug" | "error" | "info" | "success",
    message: string,
  ) => {
    if (level !== "debug" || log.level === "debug") {
      emitFactoryEvent({
        type: "agent.action",
        agentId,
        action: stripVTControlCharacters(message),
      });
    }
    withLogSource({ type: "agent", id: agentId }, () =>
      log.withColor(color, () => log[level](prefixLog(message))),
    );
  };
  const agentLog = {
    debug: (message: string) => writeAgentLog("debug", message),
    error: (message: string) => writeAgentLog("error", message),
    info: (message: string) => writeAgentLog("info", message),
    success: (message: string) => writeAgentLog("success", message),
  };
  let activeReport: AgentReport | undefined;

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
      activeReport = params;
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
  const extensionsEnabled = resources?.extensions !== false;
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
    extensionFactories: [
      ...(extensionsEnabled
        ? [{ name: "factory-web-fetch", factory: webFetchExtension }]
        : []),
      ...(options.extensions ?? []),
    ],
    noExtensions: !extensionsEnabled,
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
        ...(options.tools ?? [
          "read",
          "bash",
          "edit",
          "write",
          ...(extensionsEnabled ? ["web_fetch"] : []),
        ]),
        "report_outcome",
      ]),
    ],
  });
  initialize?.(session);

  let disposed = false;
  let running = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (running) abortSession(session, agentLog);
    session.dispose();
  };

  const runOutcome: FactoryAgent["runOutcome"] = async (
    prompt,
    { signal } = {},
  ) => {
    if (disposed) {
      throw new Error(`Agent ${agentId} has been disposed`);
    }
    if (running) {
      throw new Error(`Agent ${agentId} is already running`);
    }

    signal?.throwIfAborted();
    running = true;
    activeReport = undefined;
    let finalText: string | undefined;
    const usage = emptyTokenUsage();
    let turn = 0;
    const toolStartedAt = new Map<string, number>();

    const unsubscribe = session.subscribe((event) => {
      options.onEvent?.(event);

      if (event.type === "agent_start") {
        emitFactoryEvent({
          type: "agent.started",
          agentId,
          model: `${model.provider}/${model.id}`,
          color,
        });
        agentLog.info(
          `Agent started (model: ${model.provider}/${model.id})`,
        );
      }

      if (event.type === "turn_start") {
        turn++;
        agentLog.debug(`Turn ${turn} started`);
      }

      if (event.type === "turn_end") {
        agentLog.debug(
          `Turn ${turn} finished (${formatCount(event.toolResults.length, "tool result")})`,
        );
      }

      if (
        event.type === "tool_execution_start" &&
        event.toolName !== "report_outcome"
      ) {
        toolStartedAt.set(event.toolCallId, performance.now());
        const action = describeTool(event.toolName, event.args);
        agentLog.info(
          highlightToolAction(
            event.toolName,
            action,
          ),
        );
      }

      if (
        event.type === "tool_execution_end" &&
        event.toolName !== "report_outcome"
      ) {
        const startedAt = toolStartedAt.get(event.toolCallId);
        toolStartedAt.delete(event.toolCallId);
        const duration =
          startedAt === undefined
            ? ""
            : ` in ${formatDuration(performance.now() - startedAt)}`;

        if (event.isError) {
          agentLog.error(`${event.toolName} failed${duration}`);
        } else {
          agentLog.debug(`${event.toolName} finished${duration}`);
        }
      }

      if (event.type === "compaction_start") {
        agentLog.info(`Compacting context (${event.reason})`);
      }

      if (event.type === "compaction_end") {
        if (event.aborted) {
          agentLog.info("Context compaction aborted");
        } else if (event.result === undefined) {
          agentLog.error(
            `Context compaction failed: ${toSingleLine(event.errorMessage ?? "Unknown error")}`,
          );
        } else {
          const estimatedAfter = event.result.estimatedTokensAfter;
          agentLog.success(
            estimatedAfter === undefined
              ? `Context compacted (${event.result.tokensBefore.toLocaleString()} tokens before compaction)`
              : `Context compacted from ${event.result.tokensBefore.toLocaleString()} to about ${estimatedAfter.toLocaleString()} tokens`,
          );
        }
      }

      if (event.type === "summarization_retry_scheduled") {
        agentLog.info(
          `Retrying context summary in ${formatDelay(event.delayMs)} ` +
            `(attempt ${event.attempt}/${event.maxAttempts}): ${toSingleLine(event.errorMessage)}`,
        );
      }

      if (event.type === "summarization_retry_attempt_start") {
        agentLog.debug(`Retrying ${formatSummarySource(event.source)} summary`);
      }

      if (event.type === "summarization_retry_finished") {
        agentLog.debug("Context summary retry finished");
      }

      if (event.type === "agent_end") {
        agentLog.debug(
          `Agent finished (${formatCount(event.messages.length, "message")})`,
        );
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

      if (
        event.type === "message_end" &&
        event.message.role === "assistant"
      ) {
        finalText = event.message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");

        accumulateTokenUsage(usage, event.message.usage);
        recordTokenUsage(event.message.usage);
        agentLog.debug(`Tokens: ${formatTokenUsage(usage)}`);
      }
    });

    const abort = () => abortSession(session, agentLog);

    signal?.addEventListener("abort", abort, { once: true });
    let result: AgentResult | undefined;

    try {
      result = await log.withColor(color, async (): Promise<AgentResult> => {
        signal?.throwIfAborted();
        await session.prompt(prompt);
        signal?.throwIfAborted();

        if (activeReport === undefined) {
          agentLog.info(
            finalText !== undefined && containsMalformedToolCall(finalText)
              ? "Retrying malformed outcome report"
              : "Retrying missing outcome report",
          );
          finalText = undefined;
          await session.prompt(
            "Finish the original task by calling report_outcome with the truthful outcome. Use native tool calling; do not respond with plain text.",
          );
          signal?.throwIfAborted();
        }

        if (activeReport !== undefined) {
          return { ...activeReport, usage };
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
      });
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
      unsubscribe();
      running = false;
      agentLog.info(`Token usage: ${formatTokenUsage(usage)}`);
      emitFactoryEvent({
        type: "agent.finished",
        agentId,
        outcome: result?.outcome ?? "failed",
        usage: { ...usage },
      });
    }
  };

  return {
    id: agentId,

    async run(prompt, runOptions) {
      const report = await runOutcome(prompt, runOptions);
      if (report.outcome !== "completed") {
        throw new AgentOutcomeError(report);
      }
      return report as CompletedAgentReport;
    },

    runOutcome,

    async fork() {
      if (disposed) {
        throw new Error(`Agent ${agentId} has been disposed`);
      }
      if (running) {
        throw new Error(`Agent ${agentId} is already running`);
      }

      const messages = session.agent.state.messages;
      return createFactoryAgent(options, (forkedSession) => {
        forkedSession.agent.state.messages = messages;
      });
    },

    dispose,

    async [Symbol.asyncDispose]() {
      dispose();
    },
  };
}

function abortSession(
  session: { abort(): Promise<void> },
  agentLog: { error(message: string): void },
) {
  void session.abort().catch((error) => {
    agentLog.error(
      `Failed to abort agent: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

function formatDelay(delayMs: number): string {
  return delayMs % 1000 === 0 ? `${delayMs / 1000}s` : `${delayMs}ms`;
}

function formatAttempts(attempts: number): string {
  return `${attempts} retry ${attempts === 1 ? "attempt" : "attempts"}`;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;
}

function formatSummarySource(source: "branchSummary" | "compaction"): string {
  return source === "branchSummary" ? "branch" : "context";
}
