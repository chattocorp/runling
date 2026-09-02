import type { FactoryRuntime } from "./runtime.ts";
import { step } from "./step.ts";

export type WorkflowHandler<Arguments extends unknown[], Result> = (
  factory: FactoryRuntime,
  ...args: Arguments
) => Result;

export type NamedWorkflow<Arguments extends unknown[], Result> =
  WorkflowHandler<Arguments, Result> & {
    readonly workflowName: string;
  };

/** Defines a named, reusable workflow unit. */
export function workflow<Arguments extends unknown[], Result>(
  name: string,
  handler: WorkflowHandler<Arguments, Result>,
): NamedWorkflow<Arguments, Result> {
  const namedWorkflow = ((factory: FactoryRuntime, ...args: Arguments) =>
    step(name, () => handler(factory, ...args))) as NamedWorkflow<
    Arguments,
    Result
  >;

  Object.defineProperty(namedWorkflow, "workflowName", {
    configurable: false,
    enumerable: true,
    value: name,
    writable: false,
  });

  return namedWorkflow;
}
