# Runling

Run and orchestrate TypeScript-based worklows of any size and kind.

## Features

- Runs single workflows with a nice TUI visualization and/or logging
- Listens to webhooks (and other triggers) to execute workflows
- Workflows are simple functions, optionally decorated with input/output schemas
- Embeds the Pi SDK for easy peasy agent/LLM integration
- Automatic monitoring of token usage and cost

## Non-Features

Runling is defined more through what it does _not_ do. Here's some stuff that's not in and also not planned:

- User accounts/authentication (put it behind a reverse proxy instead)
- Coordinating multiple replicas through a datastore (Runling is small and simple)
- Visual editing of workflows (it's just JS/TS; your agent loves it!)
- 3D graphics (what?!)

## Getting Started

Add the `runling` package to your project:

```sh
pnpm add runling zod
```

Add `"runling": "runling"` to the `scripts` in your `package.json`.

Create `workflows/echo.ts`:

```ts
import { task } from "runling";
import { z } from "zod";

export default task(
  { name: "Echo", input: z.string(), output: z.string() },
  (ctx, input) => input,
);
```

Run it with `pnpm runling run workflows/echo.ts "hello"`.

Much more exciting though is Runling's ability to spin up a long-running process that will automatically execute workflows in response to webhooks being sent to it.

Create `runling.config.ts` in the project root:

```ts
import { defineWebConfig } from "runling/web";
import echo from "./workflows/echo.ts";

export default defineWebConfig({
  webhooks: { 
    echo: { task: echo }
  } 
});
```

Run `pnpm runling serve`, then open `http://localhost:5173`.

Use the console to start a run or send a request:

```sh
curl http://localhost:5173/api/webhooks/echo \
  -H 'content-type: application/json' -d '"hello"'
```

And off it goes!

Run `pnpm runling --help` to list commands. Use `run --help` or
`serve --help` to see command options, and `--version` to print the version.

## Workflow context

Every task receives a workflow context as its first argument. The runner creates
a fresh context for each execution. Pass the same context to child tasks to share
token and cost totals:

```ts
import { createWorkflowContext, runWorkflow, task } from "runling";

const uppercase = task((ctx, text: string) => text.toUpperCase());
const greet = task((ctx, name: string) => uppercase(ctx, `Hello, ${name}`));

const execution = await runWorkflow(greet, { input: "Ada" });
console.log(execution.output); // "HELLO, ADA"

// For direct task calls, create and pass a context yourself.
const ctx = createWorkflowContext();
console.log(greet(ctx, "Ada"));
console.log(ctx.usage);
```

`ctx.usage` returns a read-only snapshot with `input`, `output`, `cacheRead`,
and `cacheWrite` token counts. It includes `cost` in US dollars when a price is
reported, and `costIncomplete: true` when some recorded tokens have no price.
Custom integrations can call `ctx.recordUsage(usage)` to add one usage increment
with these fields.

Pass context to each agent interaction, including calls on reusable agents:

```ts
import { agent, createWorkflowContext, runAgent } from "runling";

const ctx = createWorkflowContext();
const options = {
  cwd: "/path/to/project",
  model: "openai-codex/gpt-5.6-sol",
};

await runAgent(ctx, "Describe this project.", options);

await using reviewer = await agent(options);
await reviewer.run(ctx, "Review the current changes.");
await reviewer.runOutcome(ctx, "Report any remaining blockers.");
console.log(ctx.usage);
```

Built-in agents record usage automatically, including reported usage before a
failure or cancellation. Do not add their returned usage to the context again.
Agent creation and forks retain no workflow context; supply it on each
`run()` or `runOutcome()` call.

Directories remain explicit. The context has no current directory; continue to
supply `cwd` for agents and `.cwd(directory)` for commands.

## Task schemas

Tasks accept [Standard Schema](https://standardschema.dev/schema) validators
such as Zod and Valibot. They validate input and output at runtime, use parsed
values, and return a Promise. The context is separate from schema input and is
not validated by the input schema. Existing TypeBox schemas remain supported.

Webhooks also require Standard JSON Schema export. Zod supports this directly;
for Valibot, wrap schemas with `toStandardJsonSchema` from
`@valibot/to-json-schema`.

## License

MIT. See [LICENSE](LICENSE).
