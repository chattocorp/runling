import { parseArgs } from "node:util";
import { log } from "./log.ts";
import { displayPath } from "./paths.ts";

export interface CliArguments {
  workflowPath: string;
  prompt: string;
  json: boolean;
  logMode: boolean;
  verbose: boolean;
}

function parseCliArguments(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: {
      json: {
        type: "boolean",
        default: false,
      },
      log: {
        type: "boolean",
        default: false,
      },
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

export function cli(
  argv: readonly string[] = process.argv.slice(2),
  command = displayPath((process.argv[1] ?? "factory")),
): CliArguments {
  let parsed: ReturnType<typeof parseCliArguments>;

  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const [workflowPath, prompt = "", ...extraPositionals] = parsed.positionals;
  if (workflowPath === undefined) {
    throw new Error(
      `Usage: ${command} [-v|--verbose] [--log|--json] <workflow.ts> [prompt]`,
    );
  }
  if (extraPositionals.length > 0) {
    throw new Error("The prompt must be passed as a single quoted argument");
  }

  const json = parsed.values.json ?? false;
  const logMode = parsed.values.log ?? false;
  const verbose = parsed.values.verbose ?? false;
  log.level = verbose ? "debug" : "info";

  return { workflowPath, prompt, json, logMode, verbose };
}
