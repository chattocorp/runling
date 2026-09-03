import {
  agent as createAgent,
  AgentOutcomeError,
  type AgentOptions,
  runAgent as runAgentOnce,
  type RunAgentOptions,
} from "./agent.ts";
import {
  getPwd as captureWorkingDirectory,
  workingTreeHash as hashWorkingTree,
} from "./git.ts";
import { randomId } from "./id.ts";
import { log } from "./log.ts";
import { createShell, ShellError, type Shell } from "./shell.ts";
import { step } from "./step.ts";
import { concat } from "./utils.ts";

interface FactoryValues {
  cwd: string;
  prompt: string;
  verbose: boolean;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WorkflowResult {
  summary: string;
  /** Human-readable Markdown shown after the summary in interactive mode. */
  details?: string;
  outputs?: Record<string, JsonValue>;
}

export type WorkflowReturn = WorkflowResult | string | undefined | void;

function agent(this: FactoryValues, options: AgentOptions) {
  return createAgent({ ...options, cwd: options.cwd ?? this.cwd });
}

function runAgent(
  this: FactoryValues,
  prompt: string,
  options: RunAgentOptions,
) {
  return runAgentOnce(prompt, { ...options, cwd: options.cwd ?? this.cwd });
}

function getPwd(this: FactoryValues, cwd = this.cwd) {
  return captureWorkingDirectory(cwd);
}

function workingTreeHash(this: FactoryValues, cwd = this.cwd) {
  return hashWorkingTree(cwd);
}

const factoryPrimitives = Object.freeze({
  agent,
  AgentOutcomeError,
  runAgent,
  getPwd,
  workingTreeHash,
  randomId,
  log,
  step,
  createShell,
  ShellError,
  concat,
});

type FactoryPrimitives = typeof factoryPrimitives;

export type Factory = FactoryPrimitives &
  FactoryValues & {
    readonly shell: Shell;
  };

export function createFactory(values: FactoryValues): Factory {
  return Object.freeze({
    ...factoryPrimitives,
    ...values,
    shell: createShell({ verbose: values.verbose }),
  });
}

export type FactoryWorkflow = (
  f: Factory,
) => Promise<WorkflowReturn> | WorkflowReturn;
