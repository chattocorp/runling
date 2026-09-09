import { runAgentWithText, progressInstructions } from "./agent-text.ts";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";
import { agent, step, task, Type, type AgentOptions, type RunlingAgent, type WorkflowContext } from "runling";

type Implementer = Pick<RunlingAgent, "runOutcome" | "dispose"> & Partial<Pick<RunlingAgent, "steer">>;
export interface ImplementationOptions {
  createAgent?: (options: AgentOptions) => Promise<Implementer>;
  prepare?: (ctx: WorkflowContext, source: string) => Promise<{ directory: string; branch: string }>;
  validate?: (ctx: WorkflowContext, directory: string) => Promise<string | null>;
  hasChanges?: (ctx: WorkflowContext, directory: string) => Promise<boolean>;
}
const git = (ctx: WorkflowContext, directory: string, ...args: string[]) =>
  execa("git", args, { cwd: directory, cancelSignal: ctx.signal, timeout: 60_000 });

export async function prepareImplementation(
  ctx: WorkflowContext, source: string,
  install = (ctx: WorkflowContext, directory: string) => execa("pnpm", ["install", "--frozen-lockfile"], {
    cwd: directory, cancelSignal: ctx.signal, timeout: 600_000,
  }).then(() => {}),
) {
  if ((await git(ctx, source, "status", "--porcelain")).stdout) throw new Error("Implementation source checkout must be clean");
  const revision = (await git(ctx, source, "rev-parse", "HEAD")).stdout;
  const id = randomUUID();
  const directory = resolve(".context", "chatto-implement", id);
  const branch = `runling/implement-${id}`;
  await mkdir(resolve(directory, ".."), { recursive: true });
  try {
    await git(ctx, source, "worktree", "add", "-b", branch, directory, revision);
    await install(ctx, directory);
    if ((await git(ctx, directory, "status", "--porcelain")).stdout) {
      throw new Error("Dependency setup changed worktree files; inspect them before retrying");
    }
  } catch (cause) {
    throw new Error(`Worktree setup stopped. Inspect ${directory} (${branch}); no cleanup was performed. ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  return { directory, branch };
}

export async function validateImplementation(ctx: WorkflowContext, directory: string): Promise<string | null> {
  for (const args of [["run", "check"], ["test"]]) {
    const result = await execa("pnpm", args, { cwd: directory, cancelSignal: ctx.signal, timeout: 600_000, env: { CI: "1" }, reject: false });
    ctx.signal.throwIfAborted();
    if (result.exitCode !== 0) return `pnpm ${args.join(" ")} failed:\n${`${result.stdout}\n${result.stderr}`.slice(-18_000)}`;
  }
  return null;
}

/** Implement an approved plan in an isolated worktree and repair failed validation. */
export function createChattoImplementation({
  createAgent = agent, prepare = prepareImplementation, validate = validateImplementation,
  hasChanges = async (ctx, directory) => !!(await git(ctx, directory, "status", "--porcelain")).stdout,
}: ImplementationOptions = {}) {
  return task({
    name: "Implement Chatto plan",
    input: Type.Object({ directory: Type.String(), plan: Type.String({ minLength: 1 }), model: Type.String() }),
    output: Type.Object({ summary: Type.String(), directory: Type.String(), branch: Type.String() }),
  }, async (ctx, { directory: source, plan, model }) => {
    await ctx.onText?.("Preparing an isolated worktree and installing dependencies.");
    const workspace = await step("Prepare implementation worktree", () => prepare(ctx, source));
    let implementer: Implementer | undefined;
    try {
      await ctx.onText?.(`Implementing the approved plan.\nWorktree: ${workspace.directory}\nBranch: ${workspace.branch}`);
      implementer = await createAgent({
        cwd: workspace.directory, model, thinkingLevel: "medium",
        tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
        resources: { extensions: false, skills: false, promptTemplates: false },
        instructions: [
          ...progressInstructions,
          "Implement only the approved plan in this worktree. Read applicable AGENTS.md files and add relevant tests.",
          "Do not commit, push, merge, deploy, or change branches. Leave changes for human review.",
          "Run relevant checks for the changed components, including backend tests when applicable. Summarize the complete change and validation.",
        ],
      });
      let prompt = `Implement this approved plan:\n\n${plan}`;
      for (let attempt = 1; attempt <= 3; attempt++) {
        ctx.signal.throwIfAborted();
        const report = await step(attempt === 1 ? "Implement approved plan" : `Repair implementation (${attempt}/3)`, () => runAgentWithText(ctx, implementer!, prompt));
        if (report.outcome !== "completed") throw new Error(report.summary);
        if (!await hasChanges(ctx, workspace.directory)) throw new Error("Agent completed without worktree changes");
        await ctx.onText?.(`Running project checks and tests (attempt ${attempt}/3).`);
        const failure = await step("Validate implementation", () => validate(ctx, workspace.directory));
        if (!failure) {
          if (!await hasChanges(ctx, workspace.directory)) throw new Error("Validation left no worktree changes");
          return { ...workspace, summary: report.details ?? report.summary };
        }
        if (attempt === 3) throw new Error(`Validation failed after 3 attempts.\n${failure}`);
        await ctx.onText?.(`Validation failed. Repairing the implementation before attempt ${attempt + 1}/3.`);
        prompt = `Repair the implementation so pnpm run check and pnpm test pass. Keep the approved scope and summarize the complete change.\n\n${failure}`;
      }
      throw new Error("Implementation did not finish");
    } catch (cause) {
      throw new Error(`Implementation stopped. Worktree retained at ${workspace.directory} (${workspace.branch}). ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    } finally { implementer?.dispose(); }
  });
}
