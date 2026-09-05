import { emitFactoryEvent } from "./events.ts";
import { log, logCommand } from "./log.ts";
import { spawn } from "node:child_process";

const COMMAND_COLOR = "#ae3ec9";
const COMMAND_PREVIEW_LENGTH = 200;

export interface ShellOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}
export class ShellError extends Error implements ShellOutput {
  constructor(
    readonly stdout: Buffer,
    readonly stderr: Buffer,
    readonly exitCode: number,
  ) {
    super(
      `Command failed with exit code ${exitCode}${stderr.length ? `: ${stderr.toString().trim()}` : ""}`,
    );
    this.name = "ShellError";
  }
}

type ShellExpression =
  | string
  | number
  | boolean
  | null
  | undefined
  | { raw: string }
  | readonly ShellExpression[];
type ShellArguments = [TemplateStringsArray, ...ShellExpression[]];

/** A configurable, single-execution shell command. Interpolated values are quoted. */
export class ShellCommand implements PromiseLike<ShellOutput> {
  private execution?: Promise<ShellOutput>;
  private directory?: string;
  private silent = true;
  private throwOnError = true;
  constructor(private readonly command: string) {}
  cwd(path: string) {
    this.directory = path;
    return this;
  }
  quiet(value = true) {
    this.silent = value;
    return this;
  }
  nothrow() {
    this.throwOnError = false;
    return this;
  }
  then<TResult1 = ShellOutput, TResult2 = never>(
    fulfilled?:
      ((value: ShellOutput) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(fulfilled, rejected);
  }
  async text() {
    return (await this).stdout.toString();
  }
  async json() {
    return JSON.parse(await this.text());
  }
  private run(): Promise<ShellOutput> {
    return (this.execution ??= new Promise((resolve, reject) => {
      const child = spawn("sh", ["-c", this.command], {
        cwd: this.directory,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
        if (!this.silent) process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
        if (!this.silent) process.stderr.write(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        const output = {
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          exitCode: code ?? 1,
        };
        if (output.exitCode !== 0 && this.throwOnError)
          reject(new ShellError(output.stdout, output.stderr, output.exitCode));
        else resolve(output);
      });
    }));
  }
}

export interface CreateShellOptions {
  verbose?: boolean;
  cwd?: string;
}

export function createShell(options: CreateShellOptions = {}) {
  return function (this: { cwd?: string } | void, ...args: ShellArguments) {
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
    const [strings, ...expressions] = args;
    const command = new ShellCommand(
      strings
        .map(
          (part, index) =>
            part +
            (index < expressions.length
              ? formatExpression(expressions[index])
              : ""),
        )
        .join(""),
    ).quiet(!(options.verbose ?? false));
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
            output: shellOutput(output),
          }),
        (error) =>
          emitFactoryEvent({
            type: "command.finished",
            id,
            status: "failed",
            durationMs: performance.now() - startedAt,
            output: shellOutput(error),
          }),
      );
    });

    return configured;
  };
}

export type Shell = ReturnType<typeof createShell>;

const shellOutput = (value: unknown): { stdout: string; stderr: string } => {
  if (typeof value !== "object" || value === null) {
    return { stdout: "", stderr: "" };
  }

  const output = value as { stdout?: unknown; stderr?: unknown };
  return {
    stdout: bufferText(output.stdout),
    stderr: bufferText(output.stderr),
  };
};

const bufferText = (value: unknown): string =>
  value instanceof Uint8Array ? new TextDecoder().decode(value) : "";

function formatCommand(...[strings, ...expressions]: ShellArguments) {
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

function formatExpression(expression: ShellExpression): string {
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

  const value = String(expression ?? "");
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
