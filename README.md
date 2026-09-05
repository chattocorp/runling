# Factory

This pnpm monorepo contains a TypeScript/Node.js framework for agent workflows and the
applications that use it.

- `packages/factory` contains the `factory` package and command.
- `workflows` contains workflow scripts.
- `apps/web` contains the SvelteKit run console. Its production build is
  included in the `factory` package.

A workflow is a TypeScript function with JSON Schema input and output. The
`factory` command loads the function and passes a `Factory` object and an
explicit input value. The object contains the working directory and the
framework functions.

The framework can:

- run coding agents;
- keep an agent session for multiple turns;
- fork an agent session;
- run shell commands;
- request user input;
- inspect Git working-tree state;
- report progress and token use.

The workflow controls all decisions. Put loops, validation, retries, model
selection, and outcome handling in the workflow.

## Use Factory in a project

Use Node.js 22.18 or later. Factory includes the TypeScript loader and the
built web UI. You do not need Bun, Vite, or SvelteKit in your project.
`f.exec` runs programs across platforms without a shell. Explicit `f.shell`
commands require a POSIX `sh` executable, as supplied by macOS and Linux.

The package name is temporary. Until publication, build and pack this repo:

```bash
pnpm install
pnpm build
pnpm --filter factory pack --pack-destination ../..
```

In your own npm project, install that tarball:

```bash
npm install /path/to/factory/factory-0.0.0.tgz
```

Add a script to your project's `package.json`:

```json
{ "scripts": { "factory": "factory" } }
```

Create `workflows/echo.ts`:

```ts
import { Type, workflow } from "factory";

export default workflow(
  { name: "Echo", input: Type.String(), output: Type.String() },
  async (f, input) => f.step("Echo input", () => {
    f.log.info(input);
    return input;
  }),
);
```

Create `factory.config.ts` in your project root:

```ts
import { defineWebConfig } from "factory/web";
import echo from "./workflows/echo.ts";

export default defineWebConfig({
  webhooks: { echo: { workflow: echo } },
});
```

Start the UI:

```bash
npm run factory
```

Open `http://localhost:5173`. Use **Run** to send a JSON string to the workflow,
or send it directly:

```bash
curl http://localhost:5173/api/webhooks/echo \
  -H 'content-type: application/json' -d '"hello"'
```

The config and workflow files can use TypeScript imports. Both ESM projects
and projects without `"type": "module"` are supported. The server reads files,
runs commands, and stores history relative to your project, not the installed
package. Restart the server after config or workflow changes.
The command loads `.env` from the project directory without replacing existing
environment variables. Keep credentials out of version control.

## Work on this repository

Install the tools and dependencies:

```bash
mise install
pnpm install
pnpm build
```

Start the packaged UI from the repository root:

```bash
pnpm factory
```

Configure credentials for each model that a workflow uses.
Use `pnpm dev:web` for the Vite development server when changing the UI.
Rebuild the framework after changing its source. No global package link is required.

## Run a workflow

Pass the workflow file and one optional request:

```bash
npm run factory -- path/to/workflow.ts "Implement the requested change"
```

Use `--log` for append-only output. Use `--verbose` for detailed output. Use
`--json` for machine-readable output.

The CLI passes the request string as the workflow input. If no request is
given, it passes an empty string. A workflow can choose to ask for user input.

In code, always pass the input explicitly. Workflows do not read `f.prompt`
as a fallback:

```ts
const result = await review(f, "Check error handling");
```

For headless execution, use `runWorkflow(review, { input: "Check error handling" })`.
The `input` option is required; the old `prompt` option is not supported.
Each workflow call still runs as a named step, including nested calls.

The workflow CLI accepts a string. Use a configured webhook or `runWorkflow`
for object, array, or other JSON inputs.

## Run a command

Use `workflow` to give the workflow a name and TypeBox schemas. Factory checks
the input before the workflow starts and checks the output before it finishes.
Use `f.exec` to run a program in the current working directory. Execa handles
process execution without a shell. Interpolated strings and numbers become
literal arguments; arrays supply multiple arguments. Do not add shell quotes
around interpolations. Commands return buffered
`stdout`, `stderr`, and an `exitCode`. Use `.text()` or `.json()` to read stdout,
`.nothrow()` to inspect a failed command, `.cwd(path)` to set its directory,
and `.quiet(false)` to stream output. Nonzero exits throw `CommandError`
(Execa's error type), unless `.nothrow()` is used. Project-local executables
in `node_modules/.bin` are available. The program must exist on the target OS.

For pipes, redirects, or shell operators, use `f.shell` explicitly. This also
uses Execa, but invokes POSIX `sh` and is not a portable alternative to
`f.exec`. Interpolations are shell-quoted; `{ raw: "..." }` bypasses quoting
and must never contain untrusted data. `ShellError` is an alias of `CommandError`.

```ts
const status = await f.exec`git status --short`.text();
await f.shell`printf hello | tr a-z A-Z`;
```

```ts
import { Type, workflow } from "factory";

export default workflow(
  {
    name: "Check project",
    input: Type.String(),
    output: Type.String(),
  },
  async (f, input) => {
    f.log.info(input);
    await f.exec`npm test`;
    return "Tests passed";
  },
);
```

## Run one agent turn

Use `f.runAgent` for one agent turn. This function creates and disposes the
agent session.

```ts
import { Type, workflow } from "factory";

export default workflow(
  {
    name: "Answer question",
    input: Type.String(),
    output: Type.String(),
  },
  async (f, input) => {
    const report = await f.runAgent(input, {
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls"],
    });

    if (report.outcome !== "completed") {
      throw new Error(report.summary);
    }

    return report.summary;
  },
);
```

Agents must call `report_outcome` at the end of each run. Factory adds this tool
to every agent.

## Reuse an agent session

Use `f.agent` when multiple turns must share one conversation. Dispose the
session with `await using`.

```ts
import { Type, workflow } from "factory";

export default workflow(
  {
    name: "Implement change",
    input: Type.String(),
    output: Type.String(),
  },
  async (f, input) => {
    await using agent = await f.agent({
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "medium",
    });

    const firstReport = await agent.run(input);
    const tests = await f.exec`npm test`.nothrow();

    if (tests.exitCode === 0) return firstReport.summary;

    const repairedReport = await agent.run(
      `Fix these test failures:\n\n${tests.stderr.toString()}`,
    );
    return repairedReport.summary;
  },
);
```

`agent.run` throws `AgentOutcomeError` for a blocked or failed outcome. Use
`agent.runOutcome` when the workflow must handle each outcome directly.

## Add local agent feedback

An agent-local extension can inspect agent events. It can add local diagnostics
to a tool result. Keep final validation in the workflow.

```ts
import { defineAgentExtension, Type, workflow } from "factory";

export default workflow(
  {
    name: "Implement with feedback",
    input: Type.String(),
    output: Type.String(),
  },
  async (f, input) => {
    const checkEdits = defineAgentExtension({
      name: "check-edits",
      factory(pi) {
        pi.on("tool_result", async (event) => {
          if (event.isError) return;
          if (event.toolName !== "edit" && event.toolName !== "write") return;

          const check = await f.exec`npm run check`.nothrow();
          if (check.exitCode === 0) return;

          return {
            content: [
              ...event.content,
              {
                type: "text",
                text: `The edit succeeded, but a check failed:\n${check.stderr.toString()}`,
              },
            ],
          };
        });
      },
    });

    await using agent = await f.agent({
      model: "openai-codex/gpt-5.6-sol",
      extensions: [checkEdits],
    });

    return (await agent.run(input)).summary;
  },
);
```

An agent can read and change files in its working directory. Use the `tools`
option to restrict its tools.

## Validate factory

Run the static checks and tests:

```bash
pnpm build
pnpm check
pnpm test
pnpm test:package
```

## Run the web app

Start the bundled production UI in your project:

```bash
npm run factory
```

By default, the executable loads `factory.config.ts` from the current directory.
Use `--config` to select another file. Use `--host`, `--port`, or `--open` to
configure the server, for example `npm run factory -- --port 3000`.
`factory web` also starts the UI. The Vite development server is only for
work on this repository; consumers run the bundled Node.js server.

The server uses jiti to load the configuration and Chokidar to watch JavaScript,
TypeScript, and JSON files below the configuration directory. Changes reload
the configuration and its local imports. Dependency, build, and hidden directories
are excluded from watching.
New runs use the new configuration. Active runs keep their original workflow.
The browser updates the hook list automatically. If a reload fails, the server
keeps the last valid configuration and shows the error in the UI and server log.
Installed package changes and changes outside that directory require a server restart.

The configuration defines named webhooks. Each webhook selects a workflow.
The request body uses that workflow's input schema and is passed directly to
the workflow. Do not define a separate body schema or input mapping.

```ts
import { defineWebConfig } from "factory/web";
import joke from "./workflows/joke.ts";

export default defineWebConfig({
  webhooks: {
    joke: {
      workflow: joke,
    },
  },
});
```

The joke workflow accepts a string. Send a JSON string, not a `value` object:

```bash
curl -X POST http://localhost:5173/api/webhooks/joke \
  -H 'content-type: application/json' \
  -d '"monorepos"'
```

The app checks the request body, passes it to the joke workflow, checks
the workflow output, and writes the output to the server log. The response has
the output in its `output` field. Configure the model credentials before you
send a webhook.

Use `GET` to inspect the workflow input and output
schemas:

```bash
curl http://localhost:5173/api/webhooks/joke
```

### Use the run console

Open the web app to see the configured webhooks and their workflows. Use
**Copy URL** to copy an endpoint with the current browser origin. Use **Run**
to edit a sample JSON request, inspect the schemas, and start a workflow.
The editor provides a starting point; the server validates each request.

The console lists the latest 100 runs. Select a run to see its nested timeline,
input, output, and logs. The horizontal timeline places activity bars on a
shared time axis, with nested labels on the left. It fits the full run by
default. Scroll or pinch to zoom, drag to pan, or use Shift+scroll to pan.
The zoom buttons use the center of the view; wheel zoom uses the pointer.
Use **Fit timeline** to return to the full run, or expand the chart for more
space. Once you zoom or pan, live updates preserve your chosen time window.
With the chart focused, use arrow keys to pan, plus/minus to zoom, and F to fit.
Expand or collapse steps, then select a bar to inspect its logs and command output. Updates
arrive through Server-Sent Events. The connection restores a snapshot after
a disconnect. Browser-started runs continue if you close the page.

The web server records runs in `.factory/runs/<run-id>.jsonl`, relative to
the workflow working directory. Each file contains the validated workflow
input, events, and final result. The directory is excluded from Git. History
includes runs started by both the console and webhook requests. Runs started
with the `factory` CLI are not recorded here.

On restart, the server restores history and marks unfinished runs as
interrupted. It does not resume them. Use one server process per history
directory. History has no automatic retention limit; files can contain
request values, agent logs, and command output. Keep this console local to
your development environment; it does not provide authentication.

The console uses `POST /api/runs/start/:name` to start a run and receive
`202 { "id": "..." }`. `GET /api/runs/:id` returns its stored state.
`GET /api/runs/events` streams the recent run list, and
`GET /api/runs/:id/events` streams a snapshot followed by new records.
The existing `POST /api/webhooks/:name` endpoint still waits for completion
and returns the workflow output.

`pnpm test:package` creates a temporary npm project, installs the packed
package, and checks the CLI, UI assets, TypeScript config loading, webhooks,
live events, and history. It does not call an AI model.
