import {
  agent,
  AgentOutcomeError,
  runAgent,
} from "./agent.ts";
import { getPwd, workingTreeHash } from "./git.ts";
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
  outputs?: Record<string, JsonValue>;
}

export type WorkflowReturn = WorkflowResult | string | undefined | void;

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
