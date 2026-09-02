import { log } from "./log.ts";

export type Workflow = () => Promise<string | undefined | void>;

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

export async function workflow(run: Workflow): Promise<void> {
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
    const duration = performance.now() - start;
    log.info(`Finished in ${formatDuration(duration)}`);
  }
}
