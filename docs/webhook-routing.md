# Webhook routing

A webhook can define `route(input, start)` to handle a delivery before Runling
creates a workflow run. The input is the validated raw JSON body; schema
transforms still run in the task.

```ts
import { defineWebConfig } from "runling/web";
import chattoPlanDemo from "./workflows/chatto-plan-demo.ts";

export default defineWebConfig({
  webhooks: {
    "chatto-plan-demo": {
      task: chattoPlanDemo,
      route: chattoPlanDemo.route,
    },
  },
});
```

A route returns `start()` to run the configured task with that input, or `null`
when it has handled or ignored the delivery. It must await or return `start()`;
repeated calls share one start operation. Without a route, every valid delivery
starts a run as before. Routes run outside workflow execution and do not receive
a workflow context.

Both `/api/runs/start/:name` and `/api/webhooks/:name` apply routing. Handled
requests return `202` with `{ "handled": true }` and create no run history.
Started requests retain their existing responses: a run ID from the asynchronous
endpoint, or the completed output from the synchronous endpoint.

The Chatto adapter sends thread replies to the open question or, while busy, to
an inbox that tasks can drain explicitly. It presents concurrent questions one
at a time and handles `/cancel` immediately. Only a new root DM starts a workflow.
Conversation and duplicate state are local to the process; routing does not add
persistence or restart recovery.
