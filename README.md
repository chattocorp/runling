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
npm add runling
```

Add `"runling": "runling"` to the `scripts` in your `package.json`.

Create `workflows/echo.ts`:

```ts
import { task, Type } from "runling";

export default task(
  { name: "Echo", input: Type.String(), output: Type.String() },
  (input) => { return input },
);
```

Run it with `npm run runling -- run workflows/echo.ts "hello"`. Yay!

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

Run `npm run runling -- serve`, then open `http://localhost:5173`.

Use the console to start a run or send a request:

```sh
curl http://localhost:5173/api/webhooks/echo \
  -H 'content-type: application/json' -d '"hello"'
```

And off it goes!

Run `npm run runling -- --help` to list commands. Use `run --help` or
`serve --help` to see command options, and `--version` to print the version.

## Tasks and directories

Wrap a normal function to track its calls. Arguments and synchronous or
asynchronous return behavior stay the same:

```ts
import { task, exec } from "runling";

const add = task((a: number, b: number) => a + b);
add(2, 3); // 5

const check = task(async (directory: string) => {
  await exec`pnpm check`.cwd(directory);
});
await check("/path/to/project");
```

Tasks receive no context object. Import `agent`, `runAgent`, `exec`, `shell`,
`step`, `log`, and `input` from `runling`. Commands require `.cwd(directory)`
or an explicit factory directory. Agents require `{ cwd: directory }`, and
Git helpers require a directory argument. No task inherits a directory from
its caller or the server.

The bundled workflows accept `{ directory, prompt }`. Use JSON input:

```sh
pnpm runling run workflows/implement.ts --input '{"directory":"/path/to/project","prompt":"Add a cache"}'
```

Use a schema-based task, as in the echo example, for a webhook. Its JSON body
is the task input. The CLI accepts one string argument or `--input <json>`;
call functions with multiple arguments directly from TypeScript. `input()`
requires a host input handler; `runWorkflow(task, { input, onInput })` can
provide one for programmatic execution.

## License

MIT. See [LICENSE](LICENSE).
