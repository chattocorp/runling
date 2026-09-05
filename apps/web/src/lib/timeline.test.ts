import { expect, test } from "vitest";
import { buildTimeline } from "./timeline.ts";
import type { FactoryEvent } from "factory";

test("rolls live snapshots through nested steps without double counting finishes or parallel agents", () => {
  const usage = {
    input: 10,
    output: 2,
    cacheRead: 30,
    cacheWrite: 1,
    cost: 0.01,
  };
  const events: FactoryEvent[] = [
    { type: "step.started", id: "root", label: "Root", timestamp: 0 },
    {
      type: "step.started",
      id: "child",
      label: "Child",
      activityId: "root",
      timestamp: 1,
    },
    {
      type: "agent.started",
      agentId: "a",
      model: "model",
      color: "blue",
      activityId: "child",
      timestamp: 2,
    },
    {
      type: "agent.started",
      agentId: "b",
      model: "model",
      color: "blue",
      activityId: "root",
      timestamp: 3,
    },
    { type: "agent.usage", agentId: "a", usage, timestamp: 4 },
    {
      type: "agent.usage",
      agentId: "a",
      usage: { ...usage, input: 20 },
      timestamp: 5,
    },
    { type: "agent.usage", agentId: "b", usage, timestamp: 6 },
  ];
  const live = buildTimeline(events, "running")[0]!;
  expect(live.usage).toEqual({
    ...usage,
    input: 30,
    output: 4,
    cacheRead: 60,
    cacheWrite: 2,
    cost: 0.02,
  });
  expect(live.children[0]?.usage?.input).toBe(20);
  events.push({
    type: "agent.finished",
    agentId: "a",
    outcome: "failed",
    usage: { ...usage, input: 20 },
    timestamp: 7,
  });
  expect(buildTimeline(events, "interrupted")[0]?.usage).toEqual(live.usage);
  // Older journals have only agent.finished events.
  expect(
    buildTimeline(
      events.filter((e) => e.type !== "agent.usage"),
      "failed",
    )[0]?.usage?.input,
  ).toBe(20);
});

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
