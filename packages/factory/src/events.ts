import { AsyncLocalStorage } from "node:async_hooks";
import type { TokenUsage } from "./usage.ts";

export type FactoryEventPayload =
  | {
      type: "log";
      level: "debug" | "info" | "success" | "error";
      message: string;
      depth: number;
      color: string;
      source?: "step" | "agent" | "command" | "input";
      sourceId?: string;
    }
  | {
      type: "step.started";
      id: string;
      label: string;
    }
  | {
      type: "step.finished";
      id: string;
      status: "completed" | "failed";
      durationMs: number;
    }
  | {
      type: "command.started";
      id: string;
      command: string;
    }
  | {
      type: "command.finished";
      id: string;
      status: "completed" | "failed";
      durationMs: number;
      output: {
        stdout: string;
        stderr: string;
      };
    }
  | {
      type: "input.requested";
      id: string;
      message: string;
      defaultValue?: string;
    }
  | {
      type: "input.finished";
      id: string;
      status: "answered";
      value: string;
      durationMs: number;
    }
  | {
      type: "input.finished";
      id: string;
      status: "failed";
      durationMs: number;
    }
  | {
      type: "agent.started";
      agentId: string;
      model: string;
      color: string;
    }
  | {
      type: "agent.action";
      agentId: string;
      action: string;
    }
  | {
      type: "agent.usage";
      agentId: string;
      usage: TokenUsage;
    }
  | {
      type: "agent.finished";
      agentId: string;
      outcome: "completed" | "blocked" | "failed";
      usage: TokenUsage;
    }
  | {
      type: "usage.updated";
      usage: TokenUsage;
    };

export type FactoryEvent = FactoryEventPayload & {
  activityId?: string;
  timestamp: number;
};

export type FactoryEventListener = (event: FactoryEvent) => void;

const listeners = new AsyncLocalStorage<readonly FactoryEventListener[]>();
const activity = new AsyncLocalStorage<string>();

export const emitFactoryEvent = (payload: FactoryEventPayload): void => {
  const event = {
    ...payload,
    activityId: activity.getStore(),
    timestamp: performance.now(),
  } as FactoryEvent;

  for (const listener of listeners.getStore() ?? []) listener(event);
};

export const observeFactoryEvents = <T>(
  listener: FactoryEventListener,
  work: () => T,
): T => listeners.run([...(listeners.getStore() ?? []), listener], work);

export const withFactoryActivity = <T>(id: string, work: () => T): T =>
  activity.run(id, work);

export const bindFactoryContext = <Args extends unknown[], Result>(
  work: (...args: Args) => Result,
): ((...args: Args) => Result) => {
  const capturedListeners = listeners.getStore() ?? [];
  const capturedActivity = activity.getStore();

  return (...args) =>
    listeners.run(capturedListeners, () =>
      capturedActivity === undefined
        ? work(...args)
        : activity.run(capturedActivity, () => work(...args)),
    );
};
