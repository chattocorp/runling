# Factory

This Bun monorepo contains a TypeScript framework for agent workflows and the
applications that use it.

- `packages/factory` contains the `factory` package and command.
- `workflows` contains workflow scripts.
- `apps/web` contains the `factory-web` executable and a small SvelteKit
  app that runs the joke workflow.

A workflow is a TypeScript function with JSON Schema input and output. The
`factory` command loads the function and gives it one `Factory` object. This
object contains the request, the working directory, and the framework
functions.

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

## Setup

Install the tools and dependencies:

```bash
mise install
bun install
```

Link the local executables during development:

```bash
bun run link
```

Configure credentials for each model that a workflow uses.

## Run a workflow

Pass the workflow file and one optional request:

```bash
factory path/to/workflow.ts "Implement the requested change"
```

Use `--log` for append-only output. Use `--verbose` for detailed output. Use
`--json` for machine-readable output.

## Run a shell command

Use `workflow` to give the workflow a name and TypeBox schemas. Factory checks
the input before the workflow starts and checks the output before it finishes.
Use `f.shell` to run a command in the current working directory.

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
    await f.shell`bun test`;
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
    const tests = await f.shell`bun test`.nothrow();

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

          const check = await f.shell`bun run check`.nothrow();
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
bun run check
bun test
```

## Run the web app

Start the SvelteKit development server:

```bash
factory-web
```

By default, the executable loads `factory.web.ts` from the current directory.
Use `--config` to select another file. Use `--host`, `--port`, or `--open` to
configure the server. The `bun run dev:web` command remains available as a
repository-local alias.

The configuration defines named webhooks. Each webhook selects a workflow.
The request body uses that workflow's input schema and is passed directly to
the workflow. Do not define a separate body schema or input mapping.

```ts
import { defineWebConfig } from "factory-web";
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

Build and start the production server with Bun:

```bash
bun run --cwd apps/web build
FACTORY_WEB_CONFIG="$PWD/factory.web.ts" \
  FACTORY_WEB_WORKFLOW_CWD="$PWD" \
  bun run --cwd apps/web start
```
