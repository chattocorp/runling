import { expect, test } from "vitest";
import { emptyTokenUsage, type RunlingEvent } from "runling";
import { summarizeRunActivity } from "./run-activity.ts";
import type { RunDetail } from "./runs.ts";

function run(events: RunlingEvent[]): RunDetail {
  return {
    id: "run", webhook: "test", workflow: "Test", source: "web", status: "running",
    startedAt: 1000, input: "private input", output: null, error: null,
    usage: emptyTokenUsage(), events,
  };
}

const events: RunlingEvent[] = [
  { type: "step.started", id: "parent", label: "Review change", timestamp: 0 },
  { type: "agent.started", agentId: "a", model: "Model A", color: "blue", activityId: "parent", timestamp: 10 },
  { type: "agent.started", agentId: "b", model: "Model B", color: "blue", activityId: "parent", timestamp: 20 },
  { type: "agent.progress", agentId: "a", text: "Reading the tests", timestamp: 30 },
];

test("shows the latest agent update with its step and parallel activity count", () => {
  expect(summarizeRunActivity(run(events))).toEqual({
    label: "Model A", step: "Review change", preview: "Reading the tests", waiting: false, parallel: 1,
  });
  expect(summarizeRunActivity(run([...events,
    { type: "agent.progress", agentId: "b", text: "Checking types", timestamp: 40 },
  ]))?.preview).toBe("Checking types");
});

test("gives input waits priority over agent updates", () => {
  const activity = summarizeRunActivity(run([...events,
    { type: "input.requested", id: "input", activityId: "parent", message: "Choose a target", timestamp: 40 },
    { type: "agent.progress", agentId: "b", text: "Still checking", timestamp: 50 },
  ]));
  expect(activity).toMatchObject({label: "Choose a target", step: "Review change", waiting: true, parallel: 2});
});

test("handles step-only work, startup, and finished runs", () => {
  expect(summarizeRunActivity(run([]))).toBeNull();
  expect(summarizeRunActivity(run([events[0]!]))).toMatchObject({ label: "Review change", waiting: false });
  expect(summarizeRunActivity({ ...run(events), status: "completed" })).toBeNull();
});

test("moves on after an activity finishes and limits long messages", () => {
  const result = summarizeRunActivity(run([...events,
    { type: "agent.finished", agentId: "a", outcome: "completed", usage: emptyTokenUsage(), timestamp: 40 },
    { type: "agent.progress", agentId: "b", text: "x".repeat(1000), timestamp: 50 },
  ]));
  expect(result?.label).toBe("Model B");
  expect(result?.parallel).toBe(0);
  expect(result?.preview).toHaveLength(500);
});
