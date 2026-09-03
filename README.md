# factory

`factory` is a small TypeScript/Bun framework for scripting agentic coding
workflows.

The library in `src/` provides mechanisms for running coding agents and
inspecting workspace state. The `factory` executable loads a workflow script,
creates a `Factory` containing those primitives and the invocation state, and
reports its result. A workflow script owns the policy: loops, retries,
validation commands, model choices, and decisions based on agent outcomes all
belong in the script.

The example workflows in `workflows/` use the framework to develop this
repository. Both files are workflow entrypoints. `workflows/implement.ts` asks
an agent to make a requested change in the current working directory, runs the
static checks and tests, and gives an agent up to two opportunities to repair
failures.
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

The example currently uses `openai-codex/gpt-5.6-sol` with medium thinking, so pi must
be able to authenticate with OpenAI (ChatGPT Plus/Pro Codex auth) before that workflow
can run.

The worktree parent directory is configured by `worktreesDirectory` near the
top of `workflows/make-pr.ts`. Its default is `../factory-worktrees`, relative
to the directory where the workflow is started. Each worktree directory uses a
human-friendly random ID such as `bright-otters-2468`, with a matching branch
named `factory/bright-otters-2468`. The workflow removes a worktree after
successfully opening its pull request. A failed run retains its worktree so the
partial change and failure can be inspected.

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

Use `--json` when another program needs to consume the result. Factory writes
one JSON document to stdout and routes its progress logs to stderr:

```bash
factory workflows/make-pr.ts --json "Add a focused feature and test it"
```

## Writing a workflow

Export an ordinary function that accepts one `Factory`. It contains framework
primitives and invocation details:

```ts
import type { Factory } from "factory";

export default async function review(f: Factory) {
  const report = await f.runAgent(f.prompt, {
    cwd: f.cwd,
    model: "openai-codex/gpt-5.6-sol",
    thinkingLevel: "medium",
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
}
```

The `Factory` contains the quoted `prompt`, the current working directory as
`cwd`, the `verbose` flag, and all framework primitives. Use `f` as its
conventional parameter name. Short local aliases can still help for values used
repeatedly. Larger workflows compose smaller ones with ordinary function calls:

```ts
import type { Factory } from "factory";

async function qualityAssurance(f: Factory) {
  f.log.info("Running tests");
  await f.shell`bun test`;
}

export default async function implement(f: Factory) {
  // Implement the change...
  await qualityAssurance(f);
}
```

Use object spread when nested work should inherit everything except specific
invocation state. For example, the pull-request workflow runs the implementation
workflow in its new worktree with:

```ts
await implement({ ...f, cwd: worktreePath });
```

A workflow may return a summary string, nothing, or a structured result with
JSON-compatible outputs:

```ts
return {
  summary: `Opened ${pullRequestUrl}`,
  outputs: {
    pullRequestUrl,
    branchName,
  },
};
```

String returns remain supported and are normalized to `{ summary }`. In JSON
mode, a successful execution has this shape:

```json
{
  "ok": true,
  "result": {
    "summary": "Opened https://github.com/example/project/pull/42",
    "outputs": {
      "pullRequestUrl": "https://github.com/example/project/pull/42",
      "branchName": "factory/bright-otters-2468"
    }
  },
  "error": null,
  "durationMs": 1234,
  "usage": {
    "input": 1200,
    "output": 340,
    "cacheRead": 45678,
    "cacheWrite": 890
  }
}
```

Failed executions set `ok` to `false`, put the message in `error`, leave
`result` as `null`, and exit with a nonzero status.

Every report also carries a `usage` object with the agent's accumulated token
counts: `input`, `output`, `cacheRead`, and `cacheWrite`. Each interaction logs
its token usage, and the workflow runner prints workflow-wide totals when it
finishes:

```
● [quiet-rivers-1234] Token usage: in 1,200, out 340, cache read 45,678, cache write 890
● Total token usage: in 3,400, out 980, cache read 120,456, cache write 1,780
● Finished in 2m31s
```

Use `agent` when several turns should share one conversation. The returned
handle owns an in-memory session. Declare it with `await using` to dispose it
automatically when its scope exits, including after errors and early returns:

```ts
await using a = await f.agent({
  cwd: f.cwd,
  model: "openai-codex/gpt-5.6-sol",
  thinkingLevel: "medium",
});

await a.run("Investigate the failure");
await a.run("Now implement the fix");
```

Calls to `run` must be sequential. Each call returns and records its own outcome
and token usage while retaining the conversation established by earlier calls.
It throws an `AgentOutcomeError` for blocked or failed outcomes. Use `runOutcome`
when the workflow needs to inspect and branch on those outcomes instead. Call
`dispose()` directly when lexical resource management is not convenient.

`runAgent` is the one-shot alternative. It creates an agent, runs one turn, and
disposes it before returning. Unlike `run`, it returns any reported outcome.

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
  model: "openai-codex/gpt-5.6-sol",
  thinkingLevel: "medium",
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

- `step(name, work)` runs an inline operation with nested log indentation.
- `agent(options)` creates an automatically disposable, in-memory agent for
  sequential multi-turn conversations.
- `runAgent(prompt, options)` runs and disposes a one-shot agent.
- `workingTreeHash(cwd)` fingerprints tracked and untracked Git state.
- `getPwd(cwd)` captures a working-directory snapshot whose `hasChanges` getter
  compares current state with the snapshot.
- `shell` is a Bun shell tag that runs from `f.cwd`, buffers command output by
  default, and streams it in verbose mode.
- `createShell(options)` creates another configured Bun shell tag.
- `ShellError` identifies failed Bun shell commands and exposes their captured
  output.
- `randomId()` generates a human-friendly adjective–noun–number identifier.
- `concat(...parts)` assembles multiline prompts.

## Validation

Run static checks with:

```bash
bun run check
```

Run tests separately with:

```bash
bun test
```
