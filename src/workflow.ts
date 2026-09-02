import { log } from "./log.ts";

export type Workflow = () => Promise<string | undefined | void>;

export async function workflow(run: Workflow): Promise<void> {
  try {
    const summary = await run();
    if (summary !== undefined) {
      log.success(summary);
    }
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
