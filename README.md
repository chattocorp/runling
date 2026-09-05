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

The configuration defines named webhooks. Each webhook has a request body
schema, a workflow, and a function that maps the request body to the workflow
input.

```ts
import { Type } from "factory";
import { defineWebConfig, webhook } from "factory-web";
import joke from "./workflows/joke.ts";

export default defineWebConfig({
  webhooks: {
    joke: webhook({
      body: Type.Object({ value: Type.String({ minLength: 1 }) }),
      workflow: joke,
      input: ({ value }) => value,
    }),
  },
});
```

Send a JSON object with a non-empty `value` string:

```bash
curl -X POST http://localhost:5173/api/webhooks/joke \
  -H 'content-type: application/json' \
  -d '{"value":"monorepos"}'
```

The app checks the request body, passes `value` to the joke workflow, checks
the workflow output, and writes the output to the server log. The response has
the output in its `output` field. Configure the model credentials before you
send a webhook.

Use `GET` to inspect the request body, workflow input, and workflow output
schemas:

```bash
curl http://localhost:5173/api/webhooks/joke
```

Build and start the production server with Bun:

```bash
bun run --cwd apps/web build
FACTORY_WEB_CONFIG="$PWD/factory.web.ts" \
  FACTORY_WEB_WORKFLOW_CWD="$PWD" \
  bun run --cwd apps/web start
```
