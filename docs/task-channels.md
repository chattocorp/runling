# Task channels

Use `spawn` when a parent must exchange data with a running child. Tasks remain
ordinary functions. The context type declares incoming messages and outgoing
updates:

```ts
import { spawn, task, type WorkflowContext } from "runling";

const sum = task(async (ctx: WorkflowContext<number, { total: number }>) => {
  let total = 0;
  for await (const amount of ctx.inbox) {
    total += amount;
    await ctx.emit({ total });
  }
  return total;
});

const child = spawn(ctx, sum);
await child.send(2);
await child.send(3);
child.closeInput();

for await (const update of child.updates) {
  console.log(update.total);
}
const total = await child.result; // 5
```

`spawn(ctx, task, ...args)` starts the task immediately and returns a handle:

- `send(value)` queues input. It does not acknowledge processing.
- `updates` is a single-consumer `AsyncIterable` of emitted values.
- `result` resolves with the task's return value, or rejects with its error.
- `closeInput()` stops new input and lets the child drain pending messages.
- `cancel(reason?)` cancels the child without cancelling its parent or siblings.

Each channel holds up to 64 queued values. Sending to a full channel rejects
with `ChannelFullError`; sending to a closed channel rejects with
`ChannelClosedError`. No send waits for free space or silently drops a value.
Consume updates while work runs if the child can emit more than the buffer holds.

Successful completion closes both channels. Buffered updates remain readable.
Failure or cancellation discards values in open channels and rejects pending
reads and future sends with the original reason. The first terminal transition
of each channel wins. Breaking out of the updates loop closes that channel and
discards its buffer; subsequent child emissions fail. Iterators permit only one
pending `next()` call.

Parent cancellation reaches the child through `ctx.signal`. Cancellation settles
the handle even if the task ignores that signal, but JavaScript cannot stop that
task's code or undo its side effects. Task code must cooperate. The parent must
await its child handles and cancel unfinished children in `finally` as needed;
parent return does not automatically join spawned work. `ctx.abort()` retains
its existing whole-workflow meaning.

A normal context from `createWorkflowContext` or `runWorkflow` has an empty inbox
and a no-op `emit`. Direct calls retain their synchronous or asynchronous return
behavior. Passing a spawned context directly to another task shares its inbox and
emitter; use another `spawn` to give that child separate channels. Usage accounting
and existing context callbacks are shared with the parent.

For standalone use, `createChannel<T>({ capacity, signal })` exposes `send`,
`close`, `fail`, and async iteration. Channels use no Node-specific imports and
hold data only in memory. The [Chatto coordinator demo](chatto-coordinator-demo.md) uses spawned
tasks for specialist steering and progress updates.

## Demo

Run `workflows/channel-demo.ts` through the CLI, or select `channel-demo` in the
web app. It needs no credentials. Its parent sends an addition, receives the
update, changes the child's label, sends another addition, and collects the
result. Starting at 0 produces three updates and a final total of 11.
