# Incoming workflow messages

A parent can give a child an explicit message channel:

```ts
const channel = createMessageChannel();
const work = child({ ...ctx, messages: channel }, input);
const consumed = await channel.send("Please use pink.");
// Keep or reroute the message if consumed is false.
await work;
```

The child subscribes while it can accept messages and releases its receiver in
`finally`. An agent receiver can use `text => agent.steer(text)`. Start the agent
interaction before sending messages to it.

A channel has one receiver. `send()` resolves to true only when the receiver
reports consumption; absence, rejection, or an exception resolves to false.
Unsubscribing stops new deliveries but does not cancel an in-flight one. The
sender owns buffering and retry. These channels are in memory and do not persist
messages or broadcast them to the workflow tree.

The Chatto coordinator owns one channel per delegated task. It routes to a sole
active child and keeps ambiguous parallel messages itself. Its existing inbox
retains messages that no agent consumed. Input answers and cancellation retain
their separate routes. See [the demo](chatto-coordinator-demo.md).
