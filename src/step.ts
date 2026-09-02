import { log } from "./log.ts";

export type StepWork<T> = () => T;

/**
 * Runs a named workflow step, indenting any log output produced by its work.
 */
export function step<T>(label: string, work: StepWork<T>): T {
  log.info(label);
  return log.indented(work);
}
