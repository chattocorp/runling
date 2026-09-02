This repository is an experiment in building the core primitive of an agentic software factory: a little TypeScript/Bun framework that you can use to script workflow scripts for agentic coding.

## Repository structure

- The framework lives in `src/`
- The root `workflow.ts` is an example workflow script (that happens to implement a development workflow for this very repository)

## Rules

- Workflow scripts like `workflow.ts` should implement loops, decisions, agent and command invocations, and other control flow constructs to implement a workflow.
- The library should provide primitives to help workflow scripts call things and inspect current state, but it should _not_ provide actual workflow logic. The workflow logic should be implemented in the workflow scripts themselves.
