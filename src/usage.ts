export interface TokenUsage {
  /** Non-cached input tokens. */
  input: number;
  /** Output tokens (including reasoning tokens when reported). */
  output: number;
  /** Input tokens served from the prompt cache. */
  cacheRead: number;
  /** Input tokens written to the prompt cache. */
  cacheWrite: number;
}

export function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/** Accumulate `usage` into `total` in place. Missing or malformed usage is ignored. */
export function accumulateTokenUsage(
  total: TokenUsage,
  usage: TokenUsage | undefined,
): TokenUsage {
  if (!isTokenUsage(usage)) {
    return total;
  }

  total.input += usage.input;
  total.output += usage.output;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  return total;
}

/** Sum of all tracked token counts; zero means nothing was recorded. */
export function totalTokens(usage: TokenUsage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatTokenUsage(usage: TokenUsage): string {
  const parts = [
    `in ${formatCount(usage.input)}`,
    `out ${formatCount(usage.output)}`,
  ];
  if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
    parts.push(`cache read ${formatCount(usage.cacheRead)}`);
    parts.push(`cache write ${formatCount(usage.cacheWrite)}`);
  }
  return parts.join(", ");
}

export function isTokenUsage(value: unknown): value is TokenUsage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TokenUsage).input === "number" &&
    typeof (value as TokenUsage).output === "number" &&
    typeof (value as TokenUsage).cacheRead === "number" &&
    typeof (value as TokenUsage).cacheWrite === "number"
  );
}

let recordedUsage = emptyTokenUsage();

/** Add one agent interaction's usage to the workflow-wide totals. */
export function recordTokenUsage(usage: TokenUsage): void {
  accumulateTokenUsage(recordedUsage, usage);
}

/** Workflow-wide token usage accumulated via `recordTokenUsage`. */
export function getRecordedTokenUsage(): TokenUsage {
  return recordedUsage;
}

/** Reset workflow-wide totals, e.g. at the start of a workflow execution. */
export function resetTokenUsage(): void {
  recordedUsage = emptyTokenUsage();
}
