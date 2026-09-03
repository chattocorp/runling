import type { Factory } from "./runtime.ts";

export type Workflow<Args extends unknown[], Result> = (
  f: Factory,
  ...args: Args
) => Result;

/** Names a workflow and nests its log output beneath that name. */
export const workflow = <Args extends unknown[], Result>(
  name: string,
  run: Workflow<Args, Result>,
): Workflow<Args, Result> =>
  (f, ...args) => f.step(name, () => run(f, ...args));
