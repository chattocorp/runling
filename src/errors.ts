export class FactoryError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FactoryError";
  }
}

export function toFactoryError(error: unknown): FactoryError {
  if (error instanceof FactoryError) {
    return error;
  }

  return new FactoryError(
    error instanceof Error ? error.message : String(error),
    1,
    { cause: error },
  );
}
