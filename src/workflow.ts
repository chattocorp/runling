import { toFactoryError } from "./errors.ts";
import { log } from "./log.ts";

export type Workflow = () => Promise<string | undefined | void>;

export async function workflow(run: Workflow): Promise<void> {
  try {
    const summary = await run();
    if (summary !== undefined) {
      log.success(summary);
    }
  } catch (error) {
    const failure = toFactoryError(error);
    log.error(failure.message);
    process.exitCode = failure.exitCode;
  }
}
