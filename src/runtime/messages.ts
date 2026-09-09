/** Return true only when the message was consumed. */
export type MessageReceiver = (text: string) => Promise<boolean>;
export interface WorkflowMessages {
  /** Attach one receiver; release it when its work ends. */
  subscribe(receiver: MessageReceiver): () => void;
}

/** A parent-owned handoff channel. Undelivered messages remain the sender's responsibility. */
export function createMessageChannel(): WorkflowMessages & { send: MessageReceiver } {
  let receiver: MessageReceiver | undefined;
  return {
    subscribe(next) {
      if (receiver) throw new Error("This message channel already has a receiver");
      receiver = next;
      let attached = true;
      return () => {
        if (attached) receiver = undefined;
        attached = false;
      };
    },
    async send(text) {
      if (!receiver) return false;
      try { return await receiver(text); }
      catch { return false; }
    },
  };
}
