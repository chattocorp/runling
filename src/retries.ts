export interface RetryContext {
  attempt: number;
  attempts: number;
}

export interface RetryFailureContext extends RetryContext {
  error: unknown;
}

export type RetryWork<Result> = (
  context: RetryContext,
) => Result | PromiseLike<Result>;

export type RetryFailureHandler = (
  context: RetryFailureContext,
) => unknown | PromiseLike<unknown>;

/** Runs `work` up to `attempts` times, handling failures between attempts. */
export async function withRetries<Result>(
  attempts: number,
  work: RetryWork<Result>,
  onFailure?: RetryFailureHandler,
): Promise<Awaited<Result>> {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError("attempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work({ attempt, attempts });
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }

      await onFailure?.({ attempt, attempts, error });
    }
  }

  throw new Error("Retry loop finished unexpectedly");
}
