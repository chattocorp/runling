import {
  accumulateTokenUsage,
  emptyTokenUsage,
  hasValidTokenCounts,
  type TokenUsage,
  type TokenUsageInput,
} from "./usage.ts";

export class WorkflowAbortError extends Error {
  override readonly name = "WorkflowAbortError";

  constructor(reason = "Workflow aborted") {
    super(reason);
  }
}

export interface WorkflowContext {
  /** Signals cancellation to agents and other cooperative work. */
  readonly signal: AbortSignal;
  /** Abort this workflow and throw its abort error. The first reason is retained. */
  abort(reason?: string): never;
  /** A snapshot of all usage recorded in this context. */
  readonly usage: Readonly<TokenUsage>;
  /** Add one usage increment, including any reported cost in US dollars. */
  recordUsage(usage: TokenUsageInput): void;
}

/** Create an independent context for direct task calls. */
export function createWorkflowContext(): WorkflowContext {
  return createObservedWorkflowContext();
}

/** Internal bridge from context accounting to runner events. */
export function createObservedWorkflowContext(
  onUsage?: (usage: TokenUsage) => void,
): WorkflowContext {
  const total = emptyTokenUsage();
  const controller = new AbortController();
  return {
    get signal() {
      return controller.signal;
    },
    abort(reason) {
      if (!controller.signal.aborted) {
        controller.abort(new WorkflowAbortError(reason));
      }
      throw controller.signal.reason;
    },
    get usage() {
      return { ...total };
    },
    recordUsage(usage) {
      if (!hasValidTokenCounts(usage)) return;
      accumulateTokenUsage(total, usage);
      onUsage?.({ ...total });
    },
  };
}
