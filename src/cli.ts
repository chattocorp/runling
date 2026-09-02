import { parseArgs } from "node:util";
import { log } from "./log.ts";
import { displayPath } from "./paths.ts";

export interface CliArguments {
  workflowPath: string;
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

export function cli(
  argv: readonly string[] = Bun.argv.slice(2),
  command = displayPath(Bun.main),
): CliArguments {
  let parsed: ReturnType<typeof parseCliArguments>;

  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const [workflowPath, prompt, ...extraPositionals] = parsed.positionals;
  if (workflowPath === undefined || prompt === undefined) {
    throw new Error(
      `Usage: ${command} [-v|--verbose] <workflow.ts> <prompt>`,
    );
  }
  if (extraPositionals.length > 0) {
    throw new Error("The prompt must be passed as a single quoted argument");
  }

  const verbose = parsed.values.verbose ?? false;
  log.level = verbose ? "debug" : "info";

  return { workflowPath, prompt, verbose };
}
