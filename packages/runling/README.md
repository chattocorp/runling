# Runling

Write TypeScript workflows for coding agents. Run them from the command line
or use the included web console to trigger runs, inspect activity, and track
token use and estimated cost.

Requires Node.js 22.18 or later. The package includes the TypeScript loader
and web UI; consumer projects do not need Bun, Vite, or SvelteKit.

## Install

```sh
npm install runling
```

Add `"runling": "runling"` to the `scripts` in your `package.json`.

## Write a workflow

Create `workflows/echo.ts`:

```ts
import { Type, workflow } from "runling";

export default workflow(
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

Keep the console local: it does not provide authentication. Workflows can
execute commands and modify files with the server's permissions. Configure
model credentials before running workflows that use agents.

See the [repository documentation](https://github.com/chattocorp/runling#readme)
for agent sessions, configuration, and workflow examples.

## License

MIT. See [LICENSE](LICENSE).
