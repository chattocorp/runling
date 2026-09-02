# factory

`factory` is a small TypeScript/Bun framework for scripting agentic coding
workflows.

The library in `src/` provides mechanisms for running coding agents, inspecting
workspace state, parsing command-line input, and reporting workflow results. A
workflow script owns the policy: loops, retries, validation commands, model
choices, and decisions based on agent outcomes all belong in the script.

The root `workflow.ts` is an example that uses the framework to develop this
repository. It asks an agent to make a change, detects whether the agent changed
the working tree, runs the tests, and gives an agent up to two opportunities to
repair test failures.

## Requirements

- [Bun](https://bun.com) 1.4.0
- `pi` 0.84.4 with credentials for the model selected by the workflow
- Git

The tool versions are declared in `mise.toml`. Install the dependencies with:

```bash
mise install
bun install
```

The example currently uses `openrouter/z-ai/glm-5.3-flash`, so pi must be able to
authenticate with OpenRouter before that workflow can run.

## Running the example

Pass the prompt as one quoted command-line argument:

```bash
bun run workflow.ts "Add a focused feature and test it"
```

Use `--verbose` or `-v` to include debug logging:

```bash
bun run workflow.ts --verbose "Investigate and fix the failing test"
```

## Writing a workflow

Use `runAgent` when the workflow needs to decide what to do with a blocked or
failed run:

```ts
import { runAgent, workflow } from "factory";

await workflow(async () => {
  const report = await runAgent("Review the current implementation", {
    model: "openrouter/z-ai/glm-5.3-flash",
    tools: ["read"],
  });

  switch (report.outcome) {
    case "completed":
      return report.summary;
    case "blocked":
      throw new Error(`Review blocked: ${report.summary}`);
    case "failed":
      throw new Error(`Review failed: ${report.summary}`);
  }
});
```

Use `agent` as a convenience when anything other than completion should stop the
workflow. It returns a completed report or throws an `AgentOutcomeError` that
retains the original report.

Agents must finish with the `report_outcome` tool. If an agent fails to do so,
the runner requests a valid report once more. A second missing report produces a
`failed` result; plain assistant text is never interpreted as successful
completion.

## Execution boundaries

Coding agents have meaningful authority. By default, `runAgent` exposes the
`read`, `bash`, `edit`, and `write` tools and loads pi's configured extensions,
skills, prompt templates, themes, and project context files. Only run a workflow
in a repository and environment you are willing to let the selected model
modify.

Callers can narrow those boundaries without putting policy in the framework:

```ts
const report = await runAgent("Inspect the repository", {
  model: "openrouter/z-ai/glm-5.3-flash",
  cwd: "/path/to/repository",
  tools: ["read"],
  signal: AbortSignal.timeout(60_000),
  resources: {
    extensions: false,
    skills: false,
    promptTemplates: false,
    themes: false,
    contextFiles: false,
  },
});
```

`report_outcome` is always available because it is part of the runner's result
contract.

## Framework primitives

- `runAgent(prompt, options)` runs an agent and returns its structured outcome.
- `agent(prompt, options)` requires a completed outcome.
- `workingTreeHash(cwd)` fingerprints tracked and untracked Git state.
- `getPwd(cwd)` captures a working-directory snapshot whose `hasChanges` getter
  compares current state with the snapshot.
- `cli(argv)` parses the example workflow's prompt and verbosity flag.
- `workflow(run)` logs the final summary or converts an uncaught error into a
  nonzero process exit code.
- `concat(...parts)` assembles multiline prompts.

## Validation

Run the complete local check with:

```bash
bun run check
```

Or run its parts independently:

```bash
bun run typecheck
bun test
```
