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
import { createInput, type Input, type InputHandler } from "./input.ts";
import { log } from "./log.ts";
import {
  createShell,
  createExec,
  CommandError,
  ShellError,
  type Shell,
  type Exec,
} from "./shell.ts";
import { step } from "./step.ts";
import { concat } from "./utils.ts";

interface RunlingValues {
  cwd: string;
  prompt: string;
  verbose: boolean;
}

export interface CreateRunlingOptions extends RunlingValues {
  handleInput?: InputHandler;
}

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface WorkflowResult {
  summary: string;
  /** Human-readable Markdown shown after the summary in interactive mode. */
  details?: string;
  outputs?: Record<string, JsonValue>;
}

export type WorkflowReturn = WorkflowResult | JsonValue | undefined | void;

function agent(this: RunlingValues, options: AgentOptions) {
  return createAgent({ ...options, cwd: options.cwd ?? this.cwd });
}

function runAgent(
  this: RunlingValues,
  prompt: string,
  options: RunAgentOptions,
) {
  return runAgentOnce(prompt, { ...options, cwd: options.cwd ?? this.cwd });
}

function getPwd(this: RunlingValues, cwd = this.cwd) {
  return captureWorkingDirectory(cwd);
}

function workingTreeHash(this: RunlingValues, cwd = this.cwd) {
  return hashWorkingTree(cwd);
}

const runlingPrimitives = Object.freeze({
  agent,
  AgentOutcomeError,
  runAgent,
  getPwd,
  workingTreeHash,
  randomId,
  log,
  step,
  createShell,
  createExec,
  CommandError,
  ShellError,
  concat,
});

type RunlingPrimitives = typeof runlingPrimitives;

export type Runling = RunlingPrimitives &
  RunlingValues & {
    readonly input: Input;
    readonly shell: Shell;
    readonly exec: Exec;
  };

export function createRunling({
  handleInput,
  ...values
}: CreateRunlingOptions): Runling {
  return Object.freeze({
    ...runlingPrimitives,
    ...values,
    input: createInput(handleInput),
    shell: createShell({ verbose: values.verbose }),
    exec: createExec({ verbose: values.verbose }),
  });
}
