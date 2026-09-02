import { $, type ShellExpression } from "bun";
import { FactoryError } from "./errors.ts";
import { log } from "./log.ts";

export type Command = (
  strings: TemplateStringsArray,
  ...expressions: ShellExpression[]
) => Promise<$.ShellOutput>;

export function run(label: string): Command {
  return async (strings, ...expressions) => {
    log.info(label);

    const command = $(strings, ...expressions).nothrow();
    const result = await (log.level === "debug" ? command : command.quiet());

    if (result.exitCode !== 0) {
      if (log.level !== "debug") {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
      }

      throw new FactoryError(`${label} failed`, 3);
    }

    return result;
  };
}
