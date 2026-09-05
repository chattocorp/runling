import type { FactoryEvent } from "factory";
import type { RunStatus } from "./runs.ts";

export interface Activity {
  id: string;
  label: string;
  kind: "step" | "command" | "agent" | "input";
  parent?: string;
  status: string;
  startedAt: number;
  durationMs?: number;
  logs: string[];
  children: Activity[];
}

export function buildTimeline(
  events: FactoryEvent[],
  runStatus: RunStatus,
): Activity[] {
  const nodes = new Map<string, Activity>();
  const agents = new Map<string, string>();
  const roots: Activity[] = [];
  const add = (node: Activity) => {
    nodes.set(node.id, node);
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    (parent?.children ?? roots).push(node);
  };
  for (const [index, event] of events.entries()) {
    const base = {
      parent: event.activityId,
      status: "running",
      startedAt: event.timestamp,
      logs: [],
      children: [],
    };
    if (event.type === "step.started")
      add({ ...base, id: event.id, kind: "step", label: event.label });
    if (event.type === "command.started")
      add({ ...base, id: event.id, kind: "command", label: event.command });
    if (event.type === "input.requested")
      add({ ...base, id: event.id, kind: "input", label: event.message });
    if (event.type === "agent.started") {
      const id = `${event.agentId}:${index}`;
      agents.set(event.agentId, id);
      add({ ...base, id, kind: "agent", label: event.model });
    }
    if (
      event.type === "step.finished" ||
      event.type === "command.finished" ||
      event.type === "input.finished"
    ) {
      const node = nodes.get(event.id);
      if (node) {
        node.status = event.status === "answered" ? "completed" : event.status;
        node.durationMs = event.durationMs;
        if (event.type === "command.finished") {
          if (event.output.stdout) node.logs.push(event.output.stdout);
          if (event.output.stderr) node.logs.push(event.output.stderr);
        }
        if (event.type === "input.finished" && event.status === "answered")
          node.logs.push(event.value);
      }
    }
    if (event.type === "agent.finished") {
      const node = nodes.get(agents.get(event.agentId) ?? "");
      if (node) {
        node.status = event.outcome;
        node.durationMs = event.timestamp - node.startedAt;
      }
    }
    if (event.type === "agent.action")
      nodes.get(agents.get(event.agentId) ?? "")?.logs.push(event.action);
    if (event.type === "log") {
      const node = nodes.get(
        event.source === "agent"
          ? (agents.get(event.sourceId ?? "") ?? "")
          : (event.sourceId ?? event.activityId ?? ""),
      );
      node?.logs.push(event.message);
    }
  }
  if (runStatus !== "running") {
    for (const node of nodes.values()) {
      if (node.status === "running") node.status = "interrupted";
    }
  }
  return roots;
}

export function findActivity(
  nodes: Activity[],
  id: string,
): Activity | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findActivity(node.children, id);
    if (child) return child;
  }
}
