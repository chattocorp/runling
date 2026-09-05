This repository is an experiment in building the core primitive of an agentic software factory: a TypeScript/Node.js framework for agentic coding workflows. Use pnpm for repository commands.

## Repository structure

- Use ASD-STE100 for prose and documentation.
- The framework package lives in `packages/runling/`
- The SvelteKit web app lives in `apps/web/`
- Workflow scripts live in `workflows/`
- `workflows/implement.ts` is a workflow entrypoint that implements and validates a requested change in the current working directory
- `workflows/make-pr.ts` is a workflow entrypoint that runs the implementation and review workflows in a worktree, opens a pull request, and posts the review as a comment
- `workflows/review.ts` is a workflow entrypoint that forks a shared investigation into parallel read-only reviews and synthesizes their findings

## Rules

- Workflow scripts are run with `runling path/to/workflow.ts "prompt"` and receive one `Runling` containing the framework primitives and invocation details.
- Workflow scripts should implement loops, decisions, agent and command invocations, and other control flow constructs to implement a workflow.
- The library should provide primitives to help workflow scripts call things and inspect current state, but it should _not_ provide actual workflow logic. The workflow logic should be implemented in the workflow scripts themselves.
- Favor standard JS/TS patterns over custom DSLs. The framework should be a thin layer over the language, not a new language.
