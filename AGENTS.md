Runling is a TypeScript-first workflow runner and orchestrator.

## Rules

- Use ASD-STE100 for prose and documentation.
- Use Conventional Commits for commit messages and PR titles.
- Do not modify the root README.md or AGENTS.md (unless asked to).

## Coding Rules

- Favor standard JS/TS patterns over custom DSLs. The framework should be
  a thin layer over the language, not a new language.
- Write TypeScript for readability. Use blank lines to separate logical
  sections, and expand control flow and callbacks instead of packing
  multiple statements onto one line.
- Add short comments where intent, lifecycle behavior, or edge cases are
  not obvious. Explain why; do not restate the code.
- Apply the same readability standards to tests and example workflows.
