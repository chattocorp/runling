import {
  mkdir,
  readdir,
  readFile,
  appendFile,
  writeFile,
  truncate,
} from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyTokenUsage,
  runWorkflow,
  type Workflow,
  type WorkflowExecution,
  type Static,
  type TSchema,
} from "factory";
import {
  applyRecord,
  type RunDetail,
  type RunRecord,
  type RunSummary,
} from "../runs.ts";

const validId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
type Listener = (id: string, record: RunRecord) => void;

/** One server process owns this journal directory. */
export class RunStore {
  private runs = new Map<string, RunDetail>();
  private pending = new Map<string, Promise<void>>();
  private listeners = new Set<Listener>();

  constructor(
    readonly directory: string,
    readonly cwd: string,
  ) {}

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    for (const file of await readdir(this.directory)) {
      const id = file.replace(/\.jsonl$/, "");
      if (!file.endsWith(".jsonl") || !validId.test(id)) continue;
      const path = resolve(this.directory, file);
      const content = await readFile(path, "utf8");
      const end = content.lastIndexOf("\n") + 1;
      try {
        const records = content
          .slice(0, end)
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as RunRecord);
        const first = records[0];
        if (first?.type !== "started" || first.run.id !== id) continue;
        let run = first.run;
        for (const record of records.slice(1)) run = applyRecord(run, record);
        this.runs.set(id, run);
        if (run.status === "running") {
          // A crash can leave the final JSON line incomplete.
          if (end < content.length)
            await truncate(path, Buffer.byteLength(content.slice(0, end)));
          await this.append(id, {
            type: "finished",
            status: "interrupted",
            finishedAt: Date.now(),
            durationMs: run.events.at(-1)?.timestamp ?? 0,
            output: null,
            usage: run.usage,
            error: "The server stopped before this run finished.",
          });
        }
      } catch (cause) {
        console.error(`Cannot restore run ${id}:`, cause);
      }
    }
  }

  list(): RunSummary[] {
    return [...this.runs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 100)
      .map(({ input: _, output: _o, error: _e, events: _v, ...run }) => run);
  }

  get(id: string): RunDetail | undefined {
    return validId.test(id) ? this.runs.get(id) : undefined;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(id: string, record: RunRecord): void {
    for (const listener of this.listeners) listener(id, record);
  }

  private append(id: string, record: RunRecord): Promise<void> {
    const next = (this.pending.get(id) ?? Promise.resolve()).then(async () => {
      await appendFile(
        resolve(this.directory, `${id}.jsonl`),
        `${JSON.stringify(record)}\n`,
      );
      this.runs.set(id, applyRecord(this.runs.get(id)!, record));
      this.publish(id, record);
    });
    this.pending.set(id, next);
    return next;
  }

  async start<I extends TSchema, O extends TSchema>(
    webhook: string,
    workflow: Workflow<I, O>,
    input: Static<I>,
    source: "webhook" | "web",
  ) {
    const id = randomUUID();
    const run: RunDetail = {
      id,
      webhook,
      workflow: workflow.name,
      source,
      input: input === undefined ? null : JSON.parse(JSON.stringify(input)),
      status: "running",
      startedAt: Date.now(),
      output: null,
      error: null,
      events: [],
      usage: emptyTokenUsage(),
    };
    const started: RunRecord = { type: "started", run };
    await writeFile(
      resolve(this.directory, `${id}.jsonl`),
      `${JSON.stringify(started)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    this.runs.set(id, run);
    this.publish(id, started);
    const completion = this.execute(id, workflow, input);
    // Background runs must always have a rejection handler, even after the HTTP client leaves.
    void completion.catch((cause) => console.error(`Run ${id} failed:`, cause));
    return { id, completion };
  }

  private async execute<I extends TSchema, O extends TSchema>(
    id: string,
    workflow: Workflow<I, O>,
    input: Static<I>,
  ): Promise<WorkflowExecution> {
    const base = performance.now();
    const execution = await runWorkflow(workflow, {
      cwd: this.cwd,
      input,
      onEvent: (event) => {
        void this.append(id, {
          type: "event",
          event: { ...event, timestamp: Math.max(0, event.timestamp - base) },
        }).catch(() => {}); // The same write failure is handled when completion flushes the queue.
      },
    });
    try {
      await this.append(id, {
        type: "finished",
        status: execution.ok ? "completed" : "failed",
        finishedAt: Date.now(),
        durationMs: execution.durationMs,
        usage: execution.usage,
        output: execution.output,
        error: execution.error,
      });
    } catch (cause) {
      const record: RunRecord = {
        type: "finished",
        status: "failed",
        finishedAt: Date.now(),
        durationMs: execution.durationMs,
        usage: execution.usage,
        output: null,
        error: `Cannot save run history: ${cause instanceof Error ? cause.message : String(cause)}`,
      };
      this.runs.set(id, applyRecord(this.runs.get(id)!, record));
      this.publish(id, record);
      throw new Error(record.error!);
    } finally {
      this.pending.delete(id);
    }
    if (execution.ok) console.log(execution.output);
    return execution;
  }
}

// Preserve active executions through Vite module reloads.
const state = globalThis as typeof globalThis & {
  __factoryRunStore?: Promise<RunStore>;
};
export function getRunStore(): Promise<RunStore> {
  state.__factoryRunStore ??= (async () => {
    const cwd = process.env.FACTORY_WEB_WORKFLOW_CWD ?? process.cwd();
    const store = new RunStore(resolve(cwd, ".factory/runs"), cwd);
    await store.init();
    return store;
  })();
  return state.__factoryRunStore;
}
