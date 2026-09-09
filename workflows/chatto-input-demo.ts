import { input, task, Type, type InputHandler } from "runling";

const deliverySchema = Type.Object({
  version: Type.Literal(1),
  id: Type.String(),
  type: Type.Literal("message.created"),
  triggers: Type.Array(Type.String()),
  occurred_at: Type.String(),
  bot_id: Type.String(),
  room_id: Type.String(),
  thread_root_id: Type.Union([Type.String(), Type.Null()]),
  message: Type.Object({ id: Type.String(), author_id: Type.String(), body: Type.String() }),
});

interface Destination {
  roomId: string;
  threadRootId: string;
}

export interface DemoOptions {
  post: (destination: Destination, body: string, signal: AbortSignal) => Promise<void>;
  timeout?: number;
}

/** Create once per server process so deliveries share pending questions. */
export function createChattoInputDemo({ post, timeout = 300 }: DemoOptions) {
  const pending = new Map<string, (answer: string) => void>();
  const active = new Set<string>();
  const seen = new Map<string, number>();

  return task({
    name: "Chatto input demo",
    input: deliverySchema,
    output: Type.Union([
      Type.String(),
      Type.Object({ name: Type.String(), topic: Type.String() }),
    ]),
  }, async (ctx, delivery) => {
    if (!delivery.triggers.includes("direct_message")) return "ignored";

    const now = Date.now();
    for (const [id, expires] of seen) if (expires <= now) seen.delete(id);
    // The same message can be delivered again, including after an edit.
    const deliveryKey = JSON.stringify([delivery.bot_id, delivery.message.id]);
    if (seen.has(deliveryKey)) return "duplicate";
    seen.set(deliveryKey, now + 86_400_000);

    const threadRootId = delivery.thread_root_id ?? delivery.message.id;
    const key = JSON.stringify([delivery.room_id, threadRootId, delivery.message.author_id]);
    const answer = pending.get(key);
    if (answer) {
      pending.delete(key);
      answer(delivery.message.body);
      return "answered";
    }
    if (active.has(key) || delivery.thread_root_id !== null) return "ignored";
    active.add(key);

    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeout * 1000)]);
    const destination = { roomId: delivery.room_id, threadRootId };
    const onInput: InputHandler = async (request) => {
      const questionSignal = request.signal
        ? AbortSignal.any([signal, request.signal]) : signal;
      questionSignal.throwIfAborted();
      let resolveAnswer!: (answer: string) => void;
      let rejectAnswer!: (error: unknown) => void;
      const response = new Promise<string>((resolve, reject) => {
        resolveAnswer = resolve;
        rejectAnswer = reject;
      });
      // Attach a rejection handler while the question POST is in flight.
      void response.catch(() => {});
      const abort = () => rejectAnswer(questionSignal.reason);
      pending.set(key, resolveAnswer);
      questionSignal.addEventListener("abort", abort, { once: true });
      try {
        await post(destination, request.message, questionSignal);
        return await response;
      } finally {
        pending.delete(key);
        questionSignal.removeEventListener("abort", abort);
      }
    };

    try {
      const chat = { ...ctx, onInput };
      const name = await input(chat, "What is your name?");
      const topic = await input(chat, "What would you like to work on?");
      await post(destination, `Thanks! Your name: ${name}\nYour topic: ${topic}`, signal);
      return { name, topic };
    } finally {
      active.delete(key);
    }
  });
}

/** ConnectRPC's JSON transport needs no generated client for this single call. */
export function createChattoPoster(serverUrl: string, apiKey: string): DemoOptions["post"] {
  const url = new URL("/api/connect/chatto.api.v1.MessageService/CreateMessage", serverUrl);
  return async ({ roomId, threadRootId }, body, signal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: JSON.stringify({ roomId, body, threadRootEventId: threadRootId }),
      signal,
    });
    if (!response.ok) throw new Error(`Chatto message request failed (${response.status})`);
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running the Chatto demo`);
  return value;
}

export default createChattoInputDemo({
  post: (destination, body, signal) =>
    createChattoPoster(required("CHATTO_URL"), required("CHATTO_API_KEY"))(
      destination, body, signal,
    ),
});
