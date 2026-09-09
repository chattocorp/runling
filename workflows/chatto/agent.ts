import type { RunlingAgent, WorkflowContext } from "runling";
import { withChattoSteering } from "./steering.ts";
import { withChattoTyping, type ChattoTyping } from "./typing.ts";
import { messageSignal, type ChattoInbox, type ChattoPost, type Destination } from "./webhook.ts";

export interface ChattoAgentOptions {
  destination: Destination;
  inbox: ChattoInbox;
  post: ChattoPost;
  typing?: ChattoTyping;
  /** Commands handled by the workflow, never forwarded to the model. */
  reservedCommands?: readonly string[];
}

/** Run an agent with typing, live steering, and ordered replies to its Chatto thread. */
export function runChattoAgent(
  ctx: WorkflowContext,
  agent: Pick<RunlingAgent, "runOutcome" | "steer">,
  prompt: string,
  { destination, inbox, post, typing, reservedCommands }: ChattoAgentOptions,
) {
  return withChattoTyping(ctx, destination, typing, () =>
    withChattoSteering(inbox, agent, async () => {
      let replies = Promise.resolve();
      try {
        const result = await agent.runOutcome(ctx, prompt, {
          onText: text => {
            replies = replies.then(() => post(destination, text, messageSignal(ctx)));
            // The agent keeps working while Chatto sends the reply.
            void replies.catch(() => {});
          },
        });
        await replies;
        return result;
      } finally {
        // Finish pending posts before the workflow presents a question or failure.
        await replies.catch(() => {});
      }
    }, reservedCommands),
  );
}
