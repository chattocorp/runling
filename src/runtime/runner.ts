import { withExecutionServices } from "./execution.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RunOptions } from "./cli.ts";
import {
  observeRunlingEvents,
  type RunlingEventListener,
} from "./events.ts";
import type { InputHandler } from "./input.ts";
import { log } from "./log.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  type JsonValue,
  type WorkflowResult,
  type WorkflowReturn,
} from "./runtime.ts";
import { TuiReporter } from "./tui.ts";
import {
  isTask,
  type TaskFunction,
} from "./workflow.ts";
import {
  formatTokenUsage,
  getRecordedTokenUsage,
  totalTokens,
  withTokenUsage,
} from "./usage.ts";

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const tenths = Math.round(ms / 100);
  if (tenths < 600) {
    return `${(tenths / 10).toFixed(1)}s`;
  }

  // Round before splitting the duration so seconds cannot render as `60s`.
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join("") || "0s";
}

export interface WorkflowExecution<Output = unknown> {
  durationMs: number;
  usage: ReturnType<typeof getRecordedTokenUsage>;
  output: Output | null;
  result: WorkflowResult | null;
  error: string | null;
  ok: boolean;
}

export interface TerminalCapabilities {
  isTTY?: boolean;
  columns?: number;
}

export interface ExecutionOptions {
  json?: boolean;
  presentation?: "log" | "tui";
  terminal?: TerminalCapabilities;
  title?: string;
}

export interface RunWorkflowOptions<Input = unknown> {
  input: Input;
  verbose?: boolean;
  onInput?: InputHandler;
  onEvent?: RunlingEventListener;
}

export function formatWorkflowDetails(
  details: string,
  terminal: TerminalCapabilities = process.stdout,
): string {
  return terminal.isTTY
    ? renderMarkdown(details, terminal.columns ?? 80)
    : details;
}

function isJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return false;
  }

  ancestors.add(value);
  // JSON omits undefined object properties. Array entries must remain valid values.
  const valid = Object.values(value).every((entry) =>
    (entry === undefined && !Array.isArray(value)) || isJsonValue(entry, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export function normalizeWorkflowResult(
  value: unknown,
): WorkflowResult | null {
  if (value === undefined) {
    return null;
  }
  if (!isJsonValue(value)) {
    throw new Error("Workflow output must be valid JSON");
  }
  if (typeof value === "string") {
    return { summary: value };
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.summary === "string" &&
      (candidate.details === undefined ||
        typeof candidate.details === "string") &&
      (candidate.outputs === undefined ||
        (isJsonValue(candidate.outputs) && !Array.isArray(candidate.outputs)))
    ) {
      return candidate as unknown as WorkflowResult;
    }
  }
  return { summary: "Workflow completed", outputs: { value } };
}

export async function executeWorkflow(
  run: () => Promise<WorkflowReturn> | WorkflowReturn,
  options: ExecutionOptions = {},
): Promise<WorkflowExecution> {
  return reportExecution(
    () => log.indented(run),
    options,
  );
}

/** Run a workflow without assuming a terminal, printing, or changing process state. */
export async function runWorkflow<Input, Output>(
  run: (input: Input) => Output,
  { input, verbose = false, onInput, onEvent = () => {} }: RunWorkflowOptions<Input>,
): Promise<WorkflowExecution<Awaited<Output>>> {
  return withExecutionServices({ verbose, handleInput: onInput }, () =>
    observeRunlingEvents(onEvent, () =>
      log.withDestination("silent", () =>
        captureExecution(() => log.indented(() => run(input))),
      ),
    ),
  );
}

async function reportExecution(
  run: (host: ExecutionHost) => Promise<unknown> | unknown,
  {
    json = false,
    presentation = "log",
    terminal = process.stdout,
    title = "Workflow",
  }: ExecutionOptions = {},
): Promise<WorkflowExecution> {
  const reporter = presentation === "tui" ? new TuiReporter(title) : undefined;

  try {
    reporter?.start();
    const execution = await observeRunlingEvents(
      reporter?.handle ?? (() => {}),
      () =>
        log.withDestination(
          presentation === "tui" ? "silent" : json ? "stderr" : "stdout",
          async () => {
            if (presentation === "log") log.info("Runling starting");
            const execution = await captureExecution(() =>
              run({ handleInput: reporter?.input }),
            );

            if (execution.error !== null) {
              log.error(execution.error);
              process.exitCode = 1;
            } else if (!json && execution.result !== null) {
              if (
                presentation === "log"
              ) {
                log.success(execution.result.summary);
                if (execution.result.details !== undefined) {
                  console.log(
                    `\n${formatWorkflowDetails(execution.result.details, terminal)}\n`,
                  );
                }
              }
            }

            if (presentation === "log" && totalTokens(execution.usage) > 0) {
              log.info(`Total token usage: ${formatTokenUsage(execution.usage)}`);
            }
            if (presentation === "log") {
              log.info(`Finished in ${formatDuration(execution.durationMs)}`);
            }

            return execution;
          },
        ),
    );

    reporter?.finish(execution);
    if (json) console.log(JSON.stringify(execution));

    return execution;
  } finally {
    reporter?.stop();
  }
}

interface ExecutionHost {
  handleInput?: InputHandler;
}

async function captureExecution<Output>(
  run: () => Promise<Output> | Output,
): Promise<WorkflowExecution<Awaited<Output>>> {
  return withTokenUsage(() => captureExecutionInContext(run));
}

async function captureExecutionInContext<Output>(
  run: () => Promise<Output> | Output,
): Promise<WorkflowExecution<Awaited<Output>>> {
  const start = performance.now();
  let result: WorkflowResult | null = null;
  let output: Awaited<Output> | null = null;
  let error: string | null = null;

  try {
    const value = await run();
    result = normalizeWorkflowResult(value);
    output = value ?? null;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const usage = getRecordedTokenUsage();
  const durationMs = performance.now() - start;

  return {
    durationMs,
    usage,
    output,
    result,
    error,
    ok: error === null,
  };
}

export async function loadWorkflow(path: string): Promise<TaskFunction> {
  const resolvedPath = resolve(path);
  const module = await import(/* @vite-ignore */ pathToFileURL(resolvedPath).href);
  if (!isTask(module.default)) {
    throw new Error(
      `Workflow ${resolvedPath} must have a default task export`,
    );
  }
  return module.default;
}

export async function runRunling(
  workflowPath: string,
  prompt: string,
  options: RunOptions,
) {
  const { json, verbose } = options;
  const presentation = shouldUseTui(options) ? "tui" : "log";
  await reportExecution(
    async ({ handleInput }) => {
      const run = await loadWorkflow(workflowPath);
      const input = options.input === undefined ? prompt : JSON.parse(options.input);
      return withExecutionServices({ verbose, handleInput }, () =>
        log.indented(() => run(input)),
      );
    },
    { json, presentation, title: workflowPath },
  );
}

export function shouldUseTui(
  options: RunOptions,
  terminal: { stdinIsTTY?: boolean; stdoutIsTTY?: boolean } = {
    stdinIsTTY: process.stdin.isTTY,
    stdoutIsTTY: process.stdout.isTTY,
  },
): boolean {
  return (
    terminal.stdinIsTTY === true &&
    terminal.stdoutIsTTY === true &&
    !options.json &&
    !options.log &&
    !options.verbose
  );
}
