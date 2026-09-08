This repository is an experiment in building the core primitive of an agentic software factory: a TypeScript/Node.js framework for agentic coding workflows. Use pnpm for repository commands.

## Repository structure

- Use ASD-STE100 for prose and documentation.
- Use Conventional Commits for commit messages and PR titles.
- The repository root is the publishable `runling` package.
- Framework primitives live in `src/runtime/`.
- The SvelteKit web app lives in `src/routes/` and `src/lib/`.
- CLI entrypoints live in `bin/`; Pi extensions live in `extensions/`.
- Workflow scripts live in `workflows/`
- `workflows/implement.ts` is a workflow entrypoint that implements and validates a requested change in an explicitly supplied directory
- `workflows/make-pr.ts` is a workflow entrypoint that runs the implementation and review workflows in a worktree, opens a pull request, and posts the review as a comment
- `workflows/review.ts` is a workflow entrypoint that forks a shared investigation into parallel read-only reviews and synthesizes their findings

## Rules

- Tasks receive only their declared inputs. Import runtime helpers from `runling`; do not add a context parameter.
- Pass directories explicitly to tasks, commands, agents, and Git helpers. Do not use a process directory or an ambient directory as a fallback.
- Use `runling run path/to/workflow.ts --input '{"directory":"/path/to/project","prompt":"request"}'` for repository workflows.
- Workflow scripts should implement loops, decisions, agent and command invocations, and other control flow constructs to implement a workflow.
- The library should provide primitives to help workflow scripts call things and inspect current state, but it should _not_ provide actual workflow logic. The workflow logic should be implemented in the workflow scripts themselves.
- Favor standard JS/TS patterns over custom DSLs. The framework should be a thin layer over the language, not a new language.
