import type { RunlingAgent, WorkflowContext } from "runling";

/** Opt in to user-facing agent text, and finish delivery before returning. */
export async function runAgentWithText(
  ctx: WorkflowContext,
  agent: Pick<RunlingAgent, "runOutcome"> & Partial<Pick<RunlingAgent, "steer">>,
  prompt: string,
) {
  let pending = Promise.resolve();
  const unsubscribe = agent.steer ? ctx.messages?.subscribe(text => agent.steer!(text)) : undefined;
  try {
    const result = await agent.runOutcome(ctx, prompt, {
      onText: text => {
        pending = pending.then(async () => { await ctx.onText?.(text); });
        // Delivery runs alongside the agent; observe rejection until we can await it.
        void pending.catch(() => {});
      },
    });
    await pending;
    return result;
  } finally {
    unsubscribe?.();
    await pending.catch(() => {});
  }
}

export const progressInstructions = [
  "Your plain text messages are posted directly to the user while you work. Write brief, user-facing progress updates.",
  "Before starting tool work, say what you will check or change. When you learn something material or change approach, explain the finding and next action in one or two sentences.",
  "Describe actions and concise conclusions, not private reasoning. Avoid narrating every tool call. Do not claim progress you have not made.",
  "Put the complete final result in report_outcome for the coordinator. Do not repeat that result in a plain text message or ask the user questions yourself.",
];
