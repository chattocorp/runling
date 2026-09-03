import { $ } from "bun";
import { log } from "./log.ts";

const COMMAND_COLOR = "#ae3ec9";

export const ShellError = $.ShellError;

export interface CreateShellOptions {
  verbose?: boolean;
}

export function createShell(options: CreateShellOptions = {}) {
  return (...args: Parameters<typeof $>) => {
    log.info(
      `${log.highlight("Running", COMMAND_COLOR)} ${formatCommand(...args)}`,
    );
    return $(...args).quiet(!(options.verbose ?? false));
  };
}

export type Shell = ReturnType<typeof createShell>;

function formatCommand(...[strings, ...expressions]: Parameters<typeof $>) {
  return strings
    .map((part, index) => {
      const expression = expressions[index];
      return expression === undefined
        ? part
        : `${part}${formatExpression(expression)}`;
    })
    .join("")
    .trim()
    .replaceAll("\n", " ");
}

function formatExpression(expression: Parameters<typeof $>[number]): string {
  if (Array.isArray(expression)) {
    return expression.map(formatExpression).join(" ");
  }
  if (
    typeof expression === "object" &&
    expression !== null &&
    "raw" in expression
  ) {
    return String(expression.raw);
  }

  return $.escape(String(expression));
}
