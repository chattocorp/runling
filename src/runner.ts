import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cli } from "./cli.ts";
import { observeFactoryEvents } from "./events.ts";
import { log } from "./log.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  createFactory,
  type Factory,
  type FactoryWorkflow,
  type JsonValue,
  type WorkflowResult,
  type WorkflowReturn,
} from "./runtime.ts";
import { TuiReporter } from "./tui.ts";
import {
  formatTokenUsage,
  getRecordedTokenUsage,
  resetTokenUsage,
  totalTokens,
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

export interface WorkflowExecution {
  durationMs: number;
  usage: ReturnType<typeof getRecordedTokenUsage>;
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
  const valid = Object.values(value).every((entry) =>
    isJsonValue(entry, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export function normalizeWorkflowResult(
  value: WorkflowReturn,
): WorkflowResult | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return { summary: value };
  }
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.summary !== "string" ||
    (value.details !== undefined && typeof value.details !== "string") ||
    (value.outputs !== undefined &&
      (!isJsonValue(value.outputs) || Array.isArray(value.outputs)))
  ) {
    throw new Error(
      "Workflow must return a string, a structured result, or nothing",
    );
  }
  return value;
}

export async function executeWorkflow(
  run: FactoryWorkflow,
  f: Factory,
  options: ExecutionOptions = {},
): Promise<WorkflowExecution> {
  return reportExecution(
    () => log.indented(() => run(f)),
    options,
  );
}

async function reportExecution(
  run: () => Promise<WorkflowReturn> | WorkflowReturn,
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
    const execution = await observeFactoryEvents(
      reporter?.handle ?? (() => {}),
      () =>
        log.withDestination(
          presentation === "tui" ? "silent" : json ? "stderr" : "stdout",
          () => captureExecution(run, { json, presentation, terminal }),
        ),
    );

    reporter?.finish(execution);
    if (json) console.log(JSON.stringify(execution));

    return execution;
  } finally {
    reporter?.stop();
  }
}

async function captureExecution(
  run: () => Promise<WorkflowReturn> | WorkflowReturn,
  {
    json,
    presentation,
    terminal,
  }: Required<Pick<ExecutionOptions, "json" | "presentation" | "terminal">>,
): Promise<WorkflowExecution> {
  resetTokenUsage();
  const start = performance.now();
  let result: WorkflowResult | null = null;
  let error: string | null = null;

  if (presentation === "log") log.info("Factory starting");
  try {
    result = normalizeWorkflowResult(await run());
    if (!json && result !== null) {
      log.success(result.summary);
      if (presentation === "log" && result.details !== undefined) {
        console.log(`\n${formatWorkflowDetails(result.details, terminal)}\n`);
      }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    log.error(error);
    process.exitCode = 1;
  }

  const usage = getRecordedTokenUsage();
  if (presentation === "log" && totalTokens(usage) > 0) {
    log.info(`Total token usage: ${formatTokenUsage(usage)}`);
  }
  const durationMs = performance.now() - start;
  if (presentation === "log") {
    log.info(`Finished in ${formatDuration(durationMs)}`);
  }

  return {
    durationMs,
    usage,
    result,
    error,
    ok: error === null,
  };
}

export async function loadWorkflow(path: string): Promise<FactoryWorkflow> {
  const resolvedPath = resolve(path);
  const module = await import(pathToFileURL(resolvedPath).href);
  if (typeof module.default !== "function") {
    throw new Error(
      `Workflow ${resolvedPath} must have a default function export`,
    );
  }
  return module.default as FactoryWorkflow;
}

export async function runFactory(argv: readonly string[] = Bun.argv.slice(2)) {
  const json = argv.includes("--json");
  const presentation = shouldUseTui(argv) ? "tui" : "log";
  const title =
    argv.find((argument) => !argument.startsWith("-")) ?? "Workflow";
  await reportExecution(
    async () => {
      const { workflowPath, prompt, verbose } = cli(argv, "factory");
      const cwd = process.cwd();
      const run = await loadWorkflow(workflowPath);
      const f = createFactory({ cwd, prompt, verbose });
      return log.indented(() => run(f));
    },
    { json, presentation, title },
  );
}

export function shouldUseTui(
  argv: readonly string[],
  terminal: { stdinIsTTY?: boolean; stdoutIsTTY?: boolean } = {
    stdinIsTTY: process.stdin.isTTY,
    stdoutIsTTY: process.stdout.isTTY,
  },
): boolean {
  return (
    terminal.stdinIsTTY === true &&
    terminal.stdoutIsTTY === true &&
    !argv.includes("--json") &&
    !argv.includes("--log") &&
    !argv.includes("--verbose") &&
    !argv.includes("-v")
  );
}
