import type { RunlingAgent } from "runling";
import type { ChattoInbox } from "./webhook.ts";

/** Forward new inbox messages while work runs; restore anything not delivered. */
export async function withChattoSteering<Result>(
  inbox: ChattoInbox,
  agent: Pick<RunlingAgent, "steer">,
  work: () => Promise<Result>,
): Promise<Result> {
  const messages: { text: string; delivered: Promise<boolean> }[] = [];
  const flush = () => {
    for (const text of inbox.drain()) {
      // Approval belongs to the workflow, never the model's steering queue.
      const delivered = text.trim() === "/implement"
        ? Promise.resolve(false)
        : agent.steer(text).catch(() => false);
      messages.push({ text, delivered });
    }
  };
  // runOutcome sets its active state synchronously before its first await.
  const result = work();
  const unsubscribe = inbox.subscribe(flush);
  try {
    flush();
    return await result;
  } finally {
    unsubscribe();
    const delivered = await Promise.all(messages.map(message => message.delivered));
    inbox.prepend(messages.filter((_message, index) => !delivered[index]).map(message => message.text));
  }
}
