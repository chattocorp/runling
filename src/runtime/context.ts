import {
  accumulateTokenUsage,
  emptyTokenUsage,
  hasValidTokenCounts,
  type TokenUsage,
  type TokenUsageInput,
} from "./usage.ts";

export interface WorkflowContext {
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
  return {
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
