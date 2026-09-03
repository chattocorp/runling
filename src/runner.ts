import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cli } from "./cli.ts";
import { log } from "./log.ts";
import {
  createFactory,
  type Factory,
  type FactoryWorkflow,
  type JsonValue,
  type WorkflowResult,
  type WorkflowReturn,
} from "./runtime.ts";
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
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  if (minutes < 60) {
    return rest > 0 ? `${minutes}m${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes - hours * 60;
  const restSeconds = Math.round(seconds - minutes * 60);
  const parts = [`${hours}h`];
  if (restMinutes > 0 || restSeconds > 0) {
    parts.push(`${restMinutes}m`);
  }
  if (restSeconds > 0) {
    parts.push(`${restSeconds}s`);
  }
  return parts.join("");
}

export interface WorkflowExecution {
  durationMs: number;
  usage: ReturnType<typeof getRecordedTokenUsage>;
  result: WorkflowResult | null;
  error: string | null;
  ok: boolean;
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
  options: { json?: boolean } = {},
): Promise<WorkflowExecution> {
  return reportExecution(
    () => log.indented(() => run(f)),
    options,
  );
}

async function reportExecution(
  run: () => Promise<WorkflowReturn> | WorkflowReturn,
  { json = false }: { json?: boolean } = {},
): Promise<WorkflowExecution> {
  const execution = await log.withDestination(
    json ? "stderr" : "stdout",
    async () => {
      resetTokenUsage();
      const start = performance.now();
      let result: WorkflowResult | null = null;
      let error: string | null = null;

      log.info("Factory starting");
      try {
        result = normalizeWorkflowResult(await run());
        if (!json && result !== null) {
          log.success(result.summary);
        }
      } catch (cause) {
        result = null;
        error = cause instanceof Error ? cause.message : String(cause);
        log.error(error);
        process.exitCode = 1;
      }

      const usage = getRecordedTokenUsage();
      if (totalTokens(usage) > 0) {
        log.info(`Total token usage: ${formatTokenUsage(usage)}`);
      }
      const durationMs = performance.now() - start;
      log.info(`Finished in ${formatDuration(durationMs)}`);

      return {
        durationMs,
        usage,
        result,
        error,
        ok: error === null,
      };
    },
  );

  if (json) {
    console.log(JSON.stringify(execution));
  }

  return execution;
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
  await reportExecution(
    async () => {
      const { workflowPath, prompt, verbose } = cli(argv, "factory");
      const cwd = process.cwd();
      const run = await loadWorkflow(workflowPath);
      const f = createFactory({ cwd, prompt, verbose });
      return log.indented(() => run(f));
    },
    { json },
  );
}
