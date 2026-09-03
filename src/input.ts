import { bindFactoryContext, emitFactoryEvent } from "./events.ts";
import { log, logInput } from "./log.ts";

export interface InputOptions {
  defaultValue?: string;
  signal?: AbortSignal;
}

export interface InputRequest extends InputOptions {
  id: string;
  message: string;
}

export type InputHandler = (request: InputRequest) => Promise<string>;
export type Input = (
  message: string,
  options?: InputOptions,
) => Promise<string>;

export class InputUnavailableError extends Error {
  constructor(message: string) {
    super(`Workflow requested input, but this host cannot provide it: ${message}`);
    this.name = "InputUnavailableError";
  }
}

export const createInput = (handleInput?: InputHandler): Input =>
  async (message, options = {}) => {
    const id = crypto.randomUUID();
    const startedAt = performance.now();
    const request = { id, message, ...options };
    const emit = bindFactoryContext(emitFactoryEvent);

    emit({
      type: "input.requested",
      id,
      message,
      defaultValue: options.defaultValue,
    });
    logInput(id, "info", `${log.highlight("Asking", "#f59f00")} ${message}`);

    try {
      options.signal?.throwIfAborted();
      if (handleInput === undefined) throw new InputUnavailableError(message);

      const value = await handleInput(request);
      if (typeof value !== "string") {
        throw new TypeError("An input handler must return a string");
      }

      emit({
        type: "input.finished",
        id,
        status: "answered",
        value,
        durationMs: performance.now() - startedAt,
      });
      logInput(id, "success", `${log.highlight("Answered")} ${value}`);
      return value;
    } catch (error) {
      emit({
        type: "input.finished",
        id,
        status: "failed",
        durationMs: performance.now() - startedAt,
      });
      logInput(id, "error", `${log.highlight("Input failed", "crimson")} ${message}`);
      throw error;
    }
  };
