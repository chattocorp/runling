import type { FactoryEvent, TokenUsage } from "factory";

export type RunStatus = "running" | "completed" | "failed" | "interrupted";
export interface RunSummary {
  id: string;
  webhook: string;
  workflow: string;
  source: "webhook" | "web";
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  usage: TokenUsage;
}
export interface RunDetail extends RunSummary {
  input: unknown;
  output: unknown;
  error: string | null;
  events: FactoryEvent[];
}
export type RunRecord =
  | { type: "started"; run: RunDetail }
  | { type: "event"; event: FactoryEvent }
  | {
      type: "finished";
      status: Exclude<RunStatus, "running">;
      finishedAt: number;
      durationMs: number;
      usage: TokenUsage;
      output: unknown;
      error: string | null;
    };

export function applyRecord(run: RunDetail, record: RunRecord): RunDetail {
  if (record.type === "started") return record.run;
  if (record.type === "event") {
    return {
      ...run,
      events: [...run.events, record.event],
      usage:
        record.event.type === "usage.updated" ? record.event.usage : run.usage,
    };
  }
  const { type: _, ...result } = record;
  return { ...run, ...result };
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export interface WebhookInfo {
  name: string;
  workflow: string;
  path: string;
  body: Record<string, unknown>;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}
