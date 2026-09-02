import { parseArgs } from "node:util";
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
    throw error instanceof Error ? error.message : String(error);
  }

  const [prompt] = parsed.positionals;
  if (prompt === undefined) {
    throw "Usage: bun workflow.ts [-v|--verbose] <prompt>";
  }

  const verbose = parsed.values.verbose ?? false;
  log.level = verbose ? "debug" : "info";

  return { prompt, verbose };
}
