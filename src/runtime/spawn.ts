import { createChannel } from "./channel.ts";
import type { WorkflowContext } from "./context.ts";

export interface TaskHandle<Incoming, Update, Result> {
  /** Queue input without waiting for the child to process it. */
  send(value: Incoming): Promise<void>;

  readonly updates: AsyncIterable<Update>;
  readonly result: Promise<Result>;

  /** Let the child finish reading its buffered input. */
  closeInput(): void;

  /** Cancel this child without cancelling its parent or siblings. */
  cancel(reason?: unknown): void;
}

/** Start a child with its own bounded input/output channels and cancellation. */
export function spawn<Incoming, Update, Args extends unknown[], Result>(
  parent: WorkflowContext<any, any>,
  run: (ctx: WorkflowContext<Incoming, Update>, ...args: Args) => Result,
  ...args: Args
): TaskHandle<Incoming, Update, Awaited<Result>> {
  // Parent cancellation flows down; cancellation through this handle stays local.
  const controller = new AbortController();
  const signal = AbortSignal.any([parent.signal, controller.signal]);

  const incoming = createChannel<Incoming>({ signal });
  const outgoing = createChannel<Update>({ signal });
  const ctx: WorkflowContext<Incoming, Update> = {
    ...parent,
    signal,
    inbox: incoming,
    emit: outgoing.send,
  };

  // Settle the handle on cancellation even if the task ignores its signal.
  // The task's underlying work still needs to cooperate to stop side effects.
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });

  // Start synchronously, preserving the caller's task/event scope.
  let work: Promise<Awaited<Result>>;

  try {
    signal.throwIfAborted();
    work = Promise.resolve(run(ctx, ...args));
  } catch (error) {
    work = Promise.reject(error);
  }

  const result = Promise.race([work, aborted])
    .then(
      (value) => {
        // Cancellation can arrive between task return and promise settlement.
        signal.throwIfAborted();
        incoming.close();
        outgoing.close();

        return value;
      },
      (error) => {
        incoming.fail(error);
        outgoing.fail(error);

        throw error;
      },
    )
    .finally(() => signal.removeEventListener("abort", onAbort));

  // Observe rejection now: the parent may read updates before awaiting result.
  void result.catch(() => {});

  return {
    send: incoming.send,
    updates: outgoing,
    result,
    closeInput: incoming.close,

    cancel(reason = new Error("Task cancelled")) {
      controller.abort(reason);
    },
  };
}
