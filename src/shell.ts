import { $ } from "bun";

export const ShellError = $.ShellError;

export interface CreateShellOptions {
  verbose?: boolean;
}

export function createShell(options: CreateShellOptions = {}) {
  return (...args: Parameters<typeof $>) =>
    $(...args).quiet(!(options.verbose ?? false));
}

export type Shell = ReturnType<typeof createShell>;
