import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cli } from "./cli.ts";
import { log } from "./log.ts";
import {
  factoryRuntime,
  type FactoryWorkflow,
  type WorkflowInvocation,
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

export async function executeWorkflow(
  workflow: FactoryWorkflow,
  invocation: WorkflowInvocation,
): Promise<void> {
  await reportExecution(() => workflow(factoryRuntime, invocation));
}

async function reportExecution(
  run: () => Promise<string | undefined | void> | string | undefined | void,
): Promise<void> {
  resetTokenUsage();
  const start = performance.now();
  try {
    const summary = await run();
    if (summary !== undefined) {
      log.success(summary);
    }
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    const totals = getRecordedTokenUsage();
    if (totalTokens(totals) > 0) {
      log.info(`Total token usage: ${formatTokenUsage(totals)}`);
    }
    log.info(`Finished in ${formatDuration(performance.now() - start)}`);
  }
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
  await reportExecution(async () => {
    const { workflowPath, prompt, verbose } = cli(argv, "factory");
    const cwd = process.cwd();
    const workflow = await loadWorkflow(workflowPath);
    return workflow(factoryRuntime, { cwd, prompt, verbose });
  });
}
