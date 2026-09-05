import { expect, test } from "vitest";
import { buildTimeline } from "./timeline.ts";
import type { RunlingEvent } from "runling";

test("uses formatted logs once without deduplicating genuine repeated messages", () => {
  const events: RunlingEvent[] = [
    {
      type: "agent.started",
      agentId: "a",
      model: "model",
      color: "blue",
      timestamp: 0,
    },
  ];
  const message = "\u001b[33m[a]\u001b[0m Reading file.ts";
  for (let i = 0; i < 2; i++) {
    events.push(
      {
        type: "agent.action",
        agentId: "a",
        action: "Reading file.ts",
        timestamp: i * 2 + 1,
      },
      {
        type: "log",
        source: "agent",
        sourceId: "a",
        message,
        level: "info",
        depth: 0,
        color: "blue",
        timestamp: i * 2 + 2,
      },
    );
  }
  const node = buildTimeline(events, "running")[0]!;
  expect(node.logs).toEqual([message, message]);
  expect(node.preview).toBe("Reading file.ts");
  // A later invocation of the same agent can still have action-only history.
  events.push(
    {
      type: "agent.started",
      agentId: "a",
      model: "model",
      color: "blue",
      timestamp: 5,
    },
    {
      type: "agent.action",
      agentId: "a",
      action: "Legacy message",
      timestamp: 6,
    },
  );
  expect(buildTimeline(events, "completed")[1]?.logs).toEqual([
    "Legacy message",
  ]);
});

test("shows legacy tool actions without letting debug or token summaries replace them", () => {
  const events: RunlingEvent[] = [
    {
      type: "agent.started",
      agentId: "a",
      model: "model",
      color: "blue",
      timestamp: 0,
    },
    ...[
      "Agent started (model: model)",
      "Reading\n src/file.ts",
      "Turn 2 started",
      "Token usage: in 10, out 2",
    ].map((action, index) => ({
      type: "agent.action" as const,
      agentId: "a",
      action,
      timestamp: index + 1,
    })),
  ];
  expect(buildTimeline(events, "completed")[0]?.preview).toBe(
    "Reading src/file.ts",
  );
  expect(buildTimeline(events, "running")[0]?.logs).toHaveLength(4);
});

test("keeps agent previews separate from logs and retains them on completion", () => {
  const nodes = buildTimeline(
    [
      {
        type: "agent.started",
        agentId: "a",
        model: "model",
        color: "blue",
        timestamp: 0,
      },
      {
        type: "agent.started",
        agentId: "b",
        model: "model",
        color: "blue",
        timestamp: 1,
      },
      {
        type: "agent.progress",
        agentId: "a",
        text: "Reading file.ts",
        timestamp: 2,
      },
      {
        type: "agent.progress",
        agentId: "b",
        text: "Running tests",
        timestamp: 3,
      },
      {
        type: "agent.action",
        agentId: "a",
        action: "Turn 2 started",
        timestamp: 4,
      },
      {
        type: "agent.finished",
        agentId: "a",
        outcome: "completed",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        timestamp: 5,
      },
    ],
    "running",
  );
  expect(nodes[0]?.preview).toBe("Reading file.ts");
  expect(nodes[0]?.logs).toEqual(["Turn 2 started"]);
  expect(nodes[1]?.preview).toBe("Running tests");
});

test("rolls live snapshots through nested steps without double counting finishes or parallel agents", () => {
  const usage = {
    input: 10,
    output: 2,
    cacheRead: 30,
    cacheWrite: 1,
    cost: 0.01,
  };
  const events: RunlingEvent[] = [
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
