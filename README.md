# factory

`factory` is a small TypeScript/Bun framework for scripting agentic coding
workflows.

The library in `src/` provides mechanisms for running coding agents and
inspecting workspace state. The `factory` executable loads a workflow script,
injects those primitives, and reports its result. A workflow script owns the
policy: loops, retries, validation commands, model choices, and decisions based
on agent outcomes all belong in the script.

The example workflows in `workflows/` use the framework to develop this
repository. Both files are workflow entrypoints. `workflows/implement.ts` asks
an agent to make a requested change in the current working directory, runs the
project checks, and gives an agent up to two opportunities to repair failures.
`workflows/make-pr.ts` creates an isolated Git worktree and branch, calls the
same implementation workflow there, then commits and pushes the change, opens
a pull request, and prints its URL.

## Requirements

- [Bun](https://bun.com) 1.4.0
- `pi` 0.84.4 with credentials for the model selected by the workflow
- Git with an `origin` push remote
- [GitHub CLI](https://cli.github.com) authenticated for that remote

The tool versions are declared in `mise.toml`. Install the dependencies with:

```bash
mise install
bun install
```

For development, expose the local executable with `bun link`. Bun places its
global command link in `~/.bun/bin`; make sure that directory is on your
`PATH`. For Fish:

```fish
fish_add_path ~/.bun/bin
```

The example currently uses `openrouter/z-ai/glm-5.3-flash`, so pi must be able to
authenticate with OpenRouter before that workflow can run.

The worktree parent directory is configured by `worktreesDirectory` near the
top of `workflows/make-pr.ts`. Its default is `../factory-worktrees`, relative
to the directory where the workflow is started. The workflow removes a
worktree after successfully opening its pull request. A failed run retains its
worktree so the partial change and failure can be inspected.

## Running the workflows

Pass the prompt as one quoted command-line argument. To implement and validate
the change directly in the current working directory:

```bash
factory workflows/implement.ts "Add a focused feature and test it"
```

To implement the change in an isolated worktree and open a pull request:

```bash
factory workflows/make-pr.ts "Add a focused feature and test it"
```

By default, raw command output is suppressed while workflow progress and the
final result remain visible. Use `--verbose` or `-v` to include debug logging
and command output:

```bash
factory workflows/make-pr.ts --verbose "Investigate and fix the failing test"
```

## Writing a workflow

Every workflow has a default function export. The executable passes the
framework runtime as its first argument and the invocation details as its
second. Framework values require no runtime imports; a type-only import provides
editor and compiler checking:

```ts
import type { FactoryWorkflow } from "factory";

const review: FactoryWorkflow = async ({ runAgent }, { prompt, cwd }) => {
  const report = await runAgent(prompt, {
    cwd,
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
};

export default review;
```

The invocation contains the quoted `prompt`, the current working directory as
`cwd`, and the `verbose` flag. Destructure only the framework primitives and
invocation values that the workflow needs. Workflow modules may also export
their implementation functions when another workflow needs to compose them.

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
- `createShell(options)` creates a Bun shell tag that buffers command output by
  default and streams it in verbose mode.
- `ShellError` identifies failed Bun shell commands and exposes their captured
  output.
- `randomId()` generates a human-friendly adjective–noun–number identifier.
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
