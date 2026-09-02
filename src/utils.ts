export type ConcatPart = string | readonly ConcatPart[];

export function concat(...parts: ConcatPart[]): string {
  const lines: string[] = [];

  const append = (part: ConcatPart) => {
    if (typeof part === "string") {
      lines.push(part);
      return;
    }

    for (const nestedPart of part) {
      append(nestedPart);
    }
  };

  for (const part of parts) {
    append(part);
  }

  return lines.join("\n");
}

export async function withRetries<T>(
  times: number,
  fn: (attempt: number) => T | Promise<T>,
  onRetry?: (error: unknown, attempt: number) => unknown | Promise<unknown>,
): Promise<T> {
  if (!Number.isInteger(times) || times < 1) {
    throw new RangeError("times must be a positive integer");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= times; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < times) {
        await onRetry?.(error, attempt);
      }
    }
  }

  throw lastError;
}
