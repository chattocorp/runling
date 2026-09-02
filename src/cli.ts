import { parseArgs } from "node:util";
import { FactoryError } from "./errors.ts";
import { log } from "./log.ts";

export interface CliArguments {
  prompt: string;
  verbose: boolean;
}

function parseCliArguments(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: {
      verbose: {
        type: "boolean",
        short: "v",
        default: false,
      },
    },
    allowPositionals: true,
    strict: true,
  });
}

export function cli(argv: readonly string[] = Bun.argv.slice(2)): CliArguments {
  let parsed: ReturnType<typeof parseCliArguments>;

  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    throw new FactoryError(
      error instanceof Error ? error.message : String(error),
      1,
      { cause: error },
    );
  }

  const [prompt] = parsed.positionals;
  if (prompt === undefined) {
    throw new FactoryError("Usage: bun index.ts [-v|--verbose] <prompt>");
  }

  const verbose = parsed.values.verbose ?? false;
  log.level = verbose ? "debug" : "info";

  return { prompt, verbose };
}
