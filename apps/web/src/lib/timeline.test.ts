import { expect, test } from "bun:test";
import { buildTimeline } from "./timeline.ts";

test("keeps repeated turns of one agent distinct and interrupts unfinished blocks", () => {
  const tree = buildTimeline(
    [
      { type: "step.started", id: "parent", label: "Parent", timestamp: 0 },
      {
        type: "agent.started",
        agentId: "agent",
        model: "model",
        color: "blue",
        activityId: "parent",
        timestamp: 1,
      },
      {
        type: "agent.finished",
        agentId: "agent",
        outcome: "completed",
        timestamp: 5,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        type: "agent.started",
        agentId: "agent",
        model: "model",
        color: "blue",
        activityId: "parent",
        timestamp: 6,
      },
    ],
    "interrupted",
  );
  expect(tree[0]?.status).toBe("interrupted");
  expect(tree[0]?.children.map((node) => node.status)).toEqual([
    "completed",
    "interrupted",
  ]);
});
