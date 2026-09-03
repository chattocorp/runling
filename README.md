# factory

`factory` is a small TypeScript/Bun framework for scripting agentic coding
workflows.

The library in `src/` provides mechanisms for running coding agents and
inspecting workspace state. The `factory` executable loads a workflow script,
creates a `Factory` containing those primitives and the invocation state, and
reports its result. A workflow script owns the policy: loops, retries,
validation commands, model choices, and decisions based on agent outcomes all
belong in the script.

Use `workflow` to name an entrypoint or subworkflow and indent its log output:

```ts
import { workflow } from "factory";

export default workflow("Implement", async (f) => {
  await f.shell`bun test`;
  return "Implemented the change";
});
```

The helper only adds the named log scope. It does not create an agent or add
any workflow behavior.

The example workflows in `workflows/` use the framework to develop this
repository. Each file is a workflow entrypoint. `workflows/implement.ts` keeps
one agent session alive while it implements a requested change, runs static
checks and tests directly, and sends any failures back to that agent for up to
two repair attempts. The same agent then summarizes the validated diff.
`workflows/make-pr.ts` creates an isolated Git worktree and branch, calls the
same implementation workflow there, and reviews the staged change before
committing and pushing it. A fresh inspection agent combines the implementation
summary with the committed diff to write the pull request title and description.
After opening the pull request, the workflow posts the synthesized review as a
comment and prints the pull request URL. The workflow captures that diff directly
and gives the inspection agent only pi's read-only `read`, `grep`, `find`, and
`ls` tools.
`workflows/review.ts` gives a read-only orchestrator the current diff, forks its
context into correctness, testing, and simplicity reviews that run in parallel,
then asks the original orchestrator to synthesize their findings.

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

The prompt is optional. Workflows that need one receive it as a single quoted
command-line argument. To implement and validate the change directly in the
current working directory:

```bash
factory workflows/implement.ts "Add a focused feature and test it"
```

To implement the change in an isolated worktree and open a pull request:

```bash
factory workflows/make-pr.ts "Add a focused feature and test it"
```

To review current working-tree changes from three parallel perspectives:

```bash
factory workflows/review.ts
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

A workflow may return a summary string, nothing, or a structured result.
`details` contains human-readable Markdown that Factory renders for an
interactive terminal. When output is redirected, Factory preserves the raw
Markdown. `outputs` contains JSON-compatible values for callers:

```ts
return {
  summary: `Opened ${pullRequestUrl}`,
  details: "## Summary\n\nImplemented and validated the requested change.",
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
    "details": "## Summary\n\nImplemented and validated the requested change.",
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
  model: "openai-codex/gpt-5.6-sol",
  thinkingLevel: "medium",
});

await a.run("Investigate the failure");
await a.run("Now implement the fix");
```

Fork an idle agent to give several agents the same conversation context without
sharing subsequent messages:

```ts
await using investigator = await f.agent({ model });
await investigator.run("Investigate the change");

await using correctness = await investigator.fork();
await using testing = await investigator.fork();

const reviews = await Promise.all([
  correctness.run("Review correctness"),
  testing.run("Review test coverage"),
]);
```

Forks are fresh in-memory sessions with their own IDs and lifecycles. They copy
the parent's current conversation and agent configuration, but later messages
and disposal are independent. An agent cannot be forked while it is running or
after it has been disposed.

Calls to `run` must be sequential. Each call returns and records its own outcome
and token usage while retaining the conversation established by earlier calls.
It throws an `AgentOutcomeError` for blocked or failed outcomes. Use `runOutcome`
when the workflow needs to inspect and branch on those outcomes instead. Call
`dispose()` directly when lexical resource management is not convenient.
Reports contain a concise, single-line `summary` and may include multiline
Markdown in `details` when the workflow needs a more substantial artifact.

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
  tools: ["read", "grep", "find", "ls"],
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
contract. The tool set shown above is pi's standard read-only tool set.

Factory logs agent and tool starts in normal output. Verbose mode additionally
logs turn boundaries and successful tool completion times. Context compaction,
automatic retries, summarization retries, tool failures, and token usage are
reported as they occur. Pass `onEvent` to `agent` or `runAgent` when workflow
code needs to observe pi's raw session-event stream directly.

## Framework primitives

- `workflow(name, run)` declares a named workflow or subworkflow and nests its
  log output beneath that name.
- `step(name, work)` runs an inline operation with nested log indentation.
- `agent(options)` creates an automatically disposable, in-memory agent for
  sequential multi-turn conversations in `f.cwd`.
- `agent.fork()` creates an independent in-memory agent from the current
  conversation.
- `runAgent(prompt, options)` runs and disposes a one-shot agent in `f.cwd`.
- `workingTreeHash(cwd?)` fingerprints tracked and untracked Git state,
  defaulting to `f.cwd`.
- `getPwd(cwd?)` captures a working-directory snapshot, defaulting to `f.cwd`,
  whose `hasChanges` getter compares current state with the snapshot.
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
