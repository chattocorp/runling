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

export function formatTokenUsage(
  usage: TokenUsage,
  language: "english" | "esperanto" = "english",
): string {
  const esperanto = language === "esperanto";
  const parts = [
    `${esperanto ? "en" : "in"} ${formatCount(usage.input)}`,
    `${esperanto ? "el" : "out"} ${formatCount(usage.output)}`,
  ];
  if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
    parts.push(
      `${esperanto ? "kaŝmemora legado" : "cache read"} ${formatCount(usage.cacheRead)}`,
    );
    parts.push(
      `${esperanto ? "kaŝmemora skribado" : "cache write"} ${formatCount(usage.cacheWrite)}`,
    );
  }
  return parts.join(", ");
}

export function isTokenUsage(value: unknown): value is TokenUsage {
  if (typeof value !== "object" || value === null) return false;

  const usage = value as TokenUsage;
  return [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].every(
    (count) => Number.isSafeInteger(count) && count >= 0,
  );
}

let recordedUsage = emptyTokenUsage();

/** Add one agent interaction's usage to the workflow-wide totals. */
export function recordTokenUsage(usage: TokenUsage): void {
  accumulateTokenUsage(recordedUsage, usage);
}

/** Workflow-wide token usage accumulated via `recordTokenUsage`. */
export function getRecordedTokenUsage(): TokenUsage {
  return { ...recordedUsage };
}

/** Reset workflow-wide totals, e.g. at the start of a workflow execution. */
export function resetTokenUsage(): void {
  recordedUsage = emptyTokenUsage();
}
