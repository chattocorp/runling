import { $ } from "bun";
import { emitFactoryEvent } from "./events.ts";
import { log, logCommand } from "./log.ts";

const COMMAND_COLOR = "#ae3ec9";
const COMMAND_PREVIEW_LENGTH = 200;

export const ShellError = $.ShellError;

export interface CreateShellOptions {
  verbose?: boolean;
  cwd?: string;
}

export function createShell(options: CreateShellOptions = {}) {
  return function (
    this: { cwd?: string } | void,
    ...args: Parameters<typeof $>
  ) {
    const id = crypto.randomUUID();
    const startedAt = performance.now();
    const formattedCommand = formatCommand(...args);
    emitFactoryEvent({
      type: "command.started",
      id,
      command: formattedCommand,
    });
    logCommand(
      id,
      `${log.highlight("Running", COMMAND_COLOR)} ${formattedCommand}`,
    );
    const command = $(...args).quiet(!(options.verbose ?? false));
    const cwd = options.cwd ?? this?.cwd;
    const configured = cwd === undefined ? command : command.cwd(cwd);

    queueMicrotask(() => {
      void configured.then(
        (output) =>
          emitFactoryEvent({
            type: "command.finished",
            id,
            status: output.exitCode === 0 ? "completed" : "failed",
            durationMs: performance.now() - startedAt,
          }),
        () =>
          emitFactoryEvent({
            type: "command.finished",
            id,
            status: "failed",
            durationMs: performance.now() - startedAt,
          }),
      );
    });

    return configured;
  };
}

export type Shell = ReturnType<typeof createShell>;

function formatCommand(...[strings, ...expressions]: Parameters<typeof $>) {
  const command = strings
    .map((part, index) => {
      const expression = expressions[index];
      return expression === undefined
        ? part
        : `${part}${formatExpression(expression)}`;
    })
    .join("")
    .trim()
    .replaceAll("\n", " ");

  if (command.length <= COMMAND_PREVIEW_LENGTH) return command;

  return `${command.slice(0, COMMAND_PREVIEW_LENGTH)}… (${(command.length - COMMAND_PREVIEW_LENGTH).toLocaleString()} characters omitted)`;
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
