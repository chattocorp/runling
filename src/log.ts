import { AsyncLocalStorage } from "node:async_hooks";

function paint(color: string, text: string) {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
}

function highlight(text: string, color = "white") {
  const ansi = Bun.color(color, "ansi") ?? "";
  return `\x1b[1m${ansi}${text}\x1b[0m`;
}

export type LogLevel = "info" | "debug";

const INDENT_UNIT = "  ";

/**
 * Tracks how deeply nested the currently running work is. Using
 * `AsyncLocalStorage` keeps concurrent steps (e.g. two agents running at the
 * same time) from corrupting each other's indentation level.
 */
const depthStorage = new AsyncLocalStorage<number>();
const colorStorage = new AsyncLocalStorage<string>();
const destinationStorage = new AsyncLocalStorage<"stdout" | "stderr">();

function indent(): string {
  return INDENT_UNIT.repeat(depthStorage.getStore() ?? 0);
}

function marker(defaultColor: string, symbol: string): string {
  return paint(colorStorage.getStore() ?? defaultColor, symbol);
}

function write(message: string, error = false): void {
  if (error || destinationStorage.getStore() === "stderr") {
    console.error(message);
  } else {
    console.log(message);
  }
}

/** A chunk of work whose log output is indented one level deeper. */
export type LoggedWork<T> = () => T;

export const log = {
  level: "info" as LogLevel,
  debug: (message: string) => {
    if (log.level === "debug") {
      write(`${indent()}${marker("gray", "·")} ${message}`);
    }
  },
  info: (message: string) =>
    write(`${indent()}${marker("dodgerblue", "●")} ${message}`),
  success: (message: string) =>
    write(`${indent()}${marker("limegreen", "✓")} ${message}`),
  error: (message: string) =>
    write(`${indent()}${marker("crimson", "✗")} ${message}`, true),
  /** Renders `text` in the active contextual color, if there is one. */
  colorize(text: string): string {
    const color = colorStorage.getStore();
    return color === undefined ? text : paint(color, text);
  },
  /** Renders `text` in a bold, bright color. */
  highlight,
  /** Runs `work` with log markers rendered in `color`. */
  withColor<T>(color: string, work: LoggedWork<T>): T {
    return colorStorage.run(color, work);
  },
  /** Runs `work` with informational output written to `destination`. */
  withDestination<T>(
    destination: "stdout" | "stderr",
    work: LoggedWork<T>,
  ): T {
    return destinationStorage.run(destination, work);
  },
  /**
   * Runs `work` with all of its log output indented one level deeper than the
   * surrounding log output. The indentation level is restored once `work`
   * finishes, even if it throws.
   */
  indented<T>(work: LoggedWork<T>): T {
    return depthStorage.run((depthStorage.getStore() ?? 0) + 1, work);
  },
};
