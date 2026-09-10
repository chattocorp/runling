# Incoming workflow messages

Use [task channels](task-channels.md) to send data to running tasks.
A parent calls `child.send(value)`; the child reads `ctx.inbox` and replies
through `ctx.emit(update)`.

For agents, [`connectAgent`](agents.md) forwards inbox messages to the active
interaction. Its delivery callback distinguishes queueing from consumption.
The sender must retain or reroute messages the agent did not consume.

The Chatto adapter keeps unacknowledged messages in its host backlog, including
commands and messages that exceed channel capacity. Input answers and
cancellation use separate routes. See [the coordinator demo](chatto-coordinator-demo.md).

This replaces `ctx.messages` and `createMessageChannel()`. Callers must migrate
to explicit task channels; `send()` now confirms queue acceptance, not consumption.
