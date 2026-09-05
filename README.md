# Factory

This Bun monorepo contains a TypeScript framework for agent workflows and the
applications that use it.

- `packages/factory` contains the `factory` package and command.
- `workflows` contains workflow scripts.
- `apps/web` contains the `factory-web` executable and a small SvelteKit
  app that runs the joke workflow.

A workflow is a TypeScript function. The `factory` command loads the function
and gives it one `Factory` object. This object contains the request, the working
directory, and the framework functions.

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

Use `workflow` to give the workflow a name. Use `f.shell` to run a command in
the current working directory.

```ts
import { workflow } from "factory";

export default workflow("Check project", async (f) => {
  await f.shell`bun test`;
  return "Tests passed";
});
```

## Run one agent turn

Use `f.runAgent` for one agent turn. This function creates and disposes the
agent session.

```ts
import { workflow } from "factory";

export default workflow("Answer question", async (f) => {
  const report = await f.runAgent(f.prompt, {
    model: "openai-codex/gpt-5.6-sol",
    thinkingLevel: "medium",
    tools: ["read", "grep", "find", "ls"],
  });

  if (report.outcome !== "completed") {
    throw new Error(report.summary);
  }

  return report.summary;
});
```

Agents must call `report_outcome` at the end of each run. Factory adds this tool
to every agent.

## Reuse an agent session

Use `f.agent` when multiple turns must share one conversation. Dispose the
session with `await using`.

```ts
import { workflow } from "factory";

export default workflow("Implement change", async (f) => {
  await using agent = await f.agent({
    model: "openai-codex/gpt-5.6-sol",
    thinkingLevel: "medium",
  });

  const firstReport = await agent.run(f.prompt);
  const tests = await f.shell`bun test`.nothrow();

  if (tests.exitCode === 0) return firstReport.summary;

  const repairedReport = await agent.run(
    `Fix these test failures:\n\n${tests.stderr.toString()}`,
  );
  return repairedReport.summary;
});
```

`agent.run` throws `AgentOutcomeError` for a blocked or failed outcome. Use
`agent.runOutcome` when the workflow must handle each outcome directly.

## Add local agent feedback

An agent-local extension can inspect agent events. It can add local diagnostics
to a tool result. Keep final validation in the workflow.

```ts
import { defineAgentExtension, workflow } from "factory";

export default workflow("Implement with feedback", async (f) => {
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

  return (await agent.run(f.prompt)).summary;
});
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

Use `--host`, `--port`, or `--open` to configure the server. The
`bun run dev:web` command remains available as a repository-local alias.

Send a JSON object with a non-empty `value` string:

```bash
curl -X POST http://localhost:5173/api/joke \
  -H 'content-type: application/json' \
  -d '{"value":"monorepos"}'
```

The app passes `value` to the joke workflow as its prompt. It waits for the
workflow, writes the generated joke to the server log, and returns the joke in
the JSON response. Configure the model credentials before you send a webhook.

Build and start the production server with Bun:

```bash
bun run --cwd apps/web build
bun run --cwd apps/web start
```
