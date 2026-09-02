import {
  agent,
  AgentOutcomeError,
  requireCompletedReport,
  runAgent,
} from "./agent.ts";
import { getPwd, workingTreeHash } from "./git.ts";
import { randomId } from "./id.ts";
import { log } from "./log.ts";
import { createShell, ShellError } from "./shell.ts";
import { step } from "./step.ts";
import { concat } from "./utils.ts";

export interface WorkflowInvocation {
  cwd: string;
  prompt: string;
  verbose: boolean;
}

export const factoryRuntime = Object.freeze({
  agent,
  AgentOutcomeError,
  requireCompletedReport,
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

export type FactoryRuntime = typeof factoryRuntime;

export type FactoryWorkflow = (
  factory: FactoryRuntime,
  invocation: WorkflowInvocation,
) => Promise<string | undefined | void> | string | undefined | void;
