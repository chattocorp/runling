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
  (input) => { return input },
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

## Task schemas

Tasks accept [Standard Schema](https://standardschema.dev/schema) validators
such as Zod and Valibot. They validate input and output at runtime, use parsed
values, and return a Promise. Existing TypeBox schemas remain supported.

Webhooks also require Standard JSON Schema export. Zod supports this directly;
for Valibot, wrap schemas with `toStandardJsonSchema` from
`@valibot/to-json-schema`.

## License

MIT. See [LICENSE](LICENSE).
