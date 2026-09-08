# Runling

Run and orchestrate TypeScript-based worklows of any size and kind.

## Features

- Runs single workflows with a nice TUI visualization and/or logging
- Listens to webhooks (and other triggers) to execute workflows
- Workflows are simple functions, optionally decorated with input/output schemas
- Embeds the Pi SDK for easy peasy agent/LLM integration
- Automatic monitoring of token usage and cost

## Non-Features

Runling is defined more through what it does _not_ do. Here's some stuff that Runling does not and likely will never do:

- User accounts/authentication (put it behind a reverse proxy instead)
- Coordinating multiple replicas through a datastore (Runling is small and simple)
- Visual editing of workflows (it's just JS/TS; your agent loves it!)
- 3D graphics (what?!)

## Install (into a project)

Add the `runling` package to your project:

```sh
npm add runling
```

## Write a workflow

Create `workflows/echo.ts`:

```ts
import { task, Type } from "runling";

export default task(
  { name: "Echo", input: Type.String(), output: Type.String() },
  (r, input) => r.step("Echo input", () => input),
);
```

Run it with `npm run runling -- workflows/echo.ts "hello"`.

## Start the web console

Create `runling.config.ts` in the project root:

```ts
import { defineWebConfig } from "runling/web";
import echo from "./workflows/echo.ts";

export default defineWebConfig({ webhooks: { echo: { workflow: echo } } });
```

Run `npm run runling`, then open `http://localhost:5173`.
Use the console to start a run or send a request:

```sh
curl http://localhost:5173/api/webhooks/echo \
  -H 'content-type: application/json' -d '"hello"'
```

## License

MIT. See [LICENSE](LICENSE).
