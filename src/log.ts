import { AsyncLocalStorage } from "node:async_hooks";

function paint(color: string, text: string) {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
}

export type LogLevel = "info" | "debug";

const INDENT_UNIT = "  ";

/**
 * Tracks how deeply nested the currently running work is. Using
 * `AsyncLocalStorage` keeps concurrent steps (e.g. two agents running at the
 * same time) from corrupting each other's indentation level.
 */
const depthStorage = new AsyncLocalStorage<number>();

function indent(): string {
  return INDENT_UNIT.repeat(depthStorage.getStore() ?? 0);
}

/** A chunk of work whose log output is indented one level deeper. */
export type LoggedWork<T> = () => T;

export const log = {
  level: "info" as LogLevel,
  debug: (message: string) => {
    if (log.level === "debug") {
      console.log(`${indent()}${paint("gray", "·")} ${message}`);
    }
  },
  info: (message: string) =>
    console.log(`${indent()}${paint("dodgerblue", "●")} ${message}`),
  success: (message: string) =>
    console.log(`${indent()}${paint("limegreen", "✓")} ${message}`),
  error: (message: string) =>
    console.error(`${indent()}${paint("crimson", "✗")} ${message}`),
  /**
   * Runs `work` with all of its log output indented one level deeper than the
   * surrounding log output. The indentation level is restored once `work`
   * finishes, even if it throws.
   */
  indented<T>(work: LoggedWork<T>): T {
    return depthStorage.run((depthStorage.getStore() ?? 0) + 1, work);
  },
};
