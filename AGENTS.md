This repository is an experiment in building the core primitive of an agentic software factory: a little TypeScript/Bun framework that you can use to script workflow scripts for agentic coding.

## Repository structure

- The framework lives in `src/`
- Workflow scripts live in `workflows/`
- `workflows/implement.ts` is a workflow entrypoint that implements and validates a requested change in the current working directory
- `workflows/make-pr.ts` is a workflow entrypoint that runs the implementation workflow in a worktree and opens a pull request

## Rules

- Workflow scripts are run with `factory path/to/workflow.ts "prompt"` and receive the framework primitives and invocation details as arguments to their default export.
- Workflow scripts should implement loops, decisions, agent and command invocations, and other control flow constructs to implement a workflow.
- The library should provide primitives to help workflow scripts call things and inspect current state, but it should _not_ provide actual workflow logic. The workflow logic should be implemented in the workflow scripts themselves.
