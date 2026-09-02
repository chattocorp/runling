import { $, type ShellExpression } from "bun";
import { FactoryError } from "./errors.ts";
import { log } from "./log.ts";

export type Command = (
  strings: TemplateStringsArray,
  ...expressions: ShellExpression[]
) => Promise<$.ShellOutput>;

function command(label: string, throwOnFailure: boolean): Command {
  return async (strings, ...expressions) => {
    log.info(label);

    const command = $(strings, ...expressions).nothrow();
    const result = await (log.level === "debug" ? command : command.quiet());

    if (throwOnFailure && result.exitCode !== 0) {
      if (log.level !== "debug") {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
      }

      throw new FactoryError(`${label} failed`, 3);
    }

    return result;
  };
}

export interface Run {
  (label: string): Command;
  check(label: string): Command;
}

export const run: Run = Object.assign(
  (label: string) => command(label, true),
  { check: (label: string) => command(label, false) },
);
