import { expect, test } from "bun:test";
import type { Terminal } from "@earendil-works/pi-tui";
import type { FactoryEvent, FactoryEventPayload } from "./events.ts";
import type { WorkflowExecution } from "./runner.ts";
import { FactoryDashboard, TuiReporter } from "./tui.ts";

const event = (
  payload: FactoryEventPayload,
  activityId?: string,
): FactoryEvent => ({
  ...payload,
  activityId,
  timestamp: 0,
}) as FactoryEvent;

test("renders activity as one semantic execution tree", () => {
  const dashboard = new FactoryDashboard("workflows/review.ts", 0);
  dashboard.handle(
    event({ type: "step.started", id: "review", label: "Review" }),
  );
  dashboard.handle(
    event(
      { type: "step.started", id: "investigate", label: "Investigate change" },
      "review",
    ),
  );
  dashboard.handle(
    event(
      { type: "command.started", id: "command", command: "git status --short" },
      "investigate",
    ),
  );
  dashboard.handle(
    event(
      {
        type: "command.finished",
        id: "command",
        status: "completed",
        durationMs: 24,
      },
      "investigate",
    ),
  );
  dashboard.handle(
    event(
      {
        type: "agent.started",
        agentId: "bright-otters-1234",
        model: "openai/gpt-5",
        color: "orange",
      },
      "investigate",
    ),
  );
  dashboard.handle(
    event({
      type: "agent.action",
      agentId: "bright-otters-1234",
      action: "Reading src/runner.ts",
    }),
  );
  dashboard.handle(
    event({
      type: "log",
      level: "info",
      message: "[bright-otters-1234] Reading src/runner.ts",
      depth: 1,
      color: "orange",
      source: "agent",
      sourceId: "bright-otters-1234",
    }),
  );
  dashboard.handle(
    event({
      type: "agent.action",
      agentId: "bright-otters-1234",
      action: "Using grep",
    }),
  );
  dashboard.handle(
    event({
      type: "log",
      level: "error",
      message: "[bright-otters-1234] read failed",
      depth: 1,
      color: "orange",
      source: "agent",
      sourceId: "bright-otters-1234",
    }),
  );
  dashboard.handle(
    event(
      {
        type: "log",
        level: "info",
        message: "Review correctness",
        depth: 1,
        color: "dodgerblue",
      },
      "investigate",
    ),
  );
  dashboard.handle(
    event({
      type: "usage.updated",
      usage: {
        input: 100,
        output: 20,
        cacheRead: 500,
        cacheWrite: 0,
        cost: 0.042,
      },
    }),
  );

  const output = Bun.stripANSI(dashboard.render(100).join("\n"));
  const lines = output.split("\n");
  expect(output).toContain("Factory  workflows/review.ts");
  expect(lines).toContain("  ● Review");
  expect(lines).toContain("    ● Investigate change");
  expect(lines).toContain("      ✓ Ran git status --short · 24ms");
  expect(
    lines.some((line) =>
      /^      [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] \[bright-otters-1234\]/.test(line),
    ),
  ).toBe(true);
  expect(lines).toContain("        ↳ Using grep");
  expect(lines).toContain("      ● Review correctness");
  expect(output).not.toContain("Active agents");
  expect(output).not.toContain("Workflow\n");
  expect(output).not.toContain("Activity");
  expect(output).not.toContain("Reading src/runner.ts");
  expect(output).not.toContain("read failed");
  expect(output).toMatch(/Working…  ·  \d+(?:m \d{2}s|s)  ·  620 tokens/);
  expect(output).toContain("83% cached");
  expect(output).toContain("$0.04");
  expect(output).toContain("0/2 steps");

  dashboard.handle(
    event(
      {
        type: "agent.finished",
        agentId: "bright-otters-1234",
        outcome: "completed",
        usage: { input: 100, output: 20, cacheRead: 500, cacheWrite: 0 },
      },
      "investigate",
    ),
  );
  const completed = Bun.stripANSI(dashboard.render(100).join("\n"));
  expect(completed).toContain("      ✓ [bright-otters-1234]");
  expect(completed).not.toContain("↳ Using grep");
});

test("renders the final Markdown report and completion state", () => {
  const dashboard = new FactoryDashboard("workflows/review.ts", 0);
  const execution: WorkflowExecution = {
    ok: true,
    error: null,
    durationMs: 1_000,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    result: {
      summary: "Review complete",
      details: "## Findings\n\nEverything looks **good**.",
    },
  };

  dashboard.finish(execution);
  const output = Bun.stripANSI(dashboard.render(80).join("\n"));

  expect(output).toContain("Completed  ·  1s  ·  0 tokens  ·  $0.00");
  expect(output).toContain("Findings");
  expect(output).toContain("Everything looks good.");
  expect(output).not.toContain("##");
  expect(output).not.toContain("**");
});

test("never renders beyond the available width", () => {
  const dashboard = new FactoryDashboard("a-very-long-workflow-name.ts", 0);
  dashboard.handle(
    event({
      type: "log",
      level: "info",
      message: "A very long message that needs to be truncated safely",
      depth: 3,
      color: "dodgerblue",
    }),
  );

  expect(
    dashboard.render(20).every((line) => Bun.stringWidth(line) <= 20),
  ).toBe(true);
});

test("drives pi-tui through the reporter lifecycle", () => {
  const terminal = new FakeTerminal();
  const reporter = new TuiReporter("workflow.ts", terminal);

  reporter.start();
  reporter.handle(
    event({
      type: "log",
      level: "info",
      message: "Doing useful work",
      depth: 0,
      color: "dodgerblue",
    }),
  );
  reporter.finish({
    ok: true,
    error: null,
    durationMs: 100,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    result: { summary: "Done" },
  });
  reporter.stop();

  expect(terminal.started).toBe(true);
  expect(terminal.stopped).toBe(true);
  expect(Bun.stripANSI(terminal.output)).toContain("Doing useful work");
});

test("restores the terminal before handling Ctrl-C", () => {
  const terminal = new FakeTerminal();
  let terminalWasStopped = false;
  const reporter = new TuiReporter("workflow.ts", terminal, () => {
    terminalWasStopped = terminal.stopped;
  });

  reporter.start();
  terminal.send("\x03");

  expect(terminalWasStopped).toBe(true);
});

class FakeTerminal implements Terminal {
  columns = 80;
  rows = 24;
  kittyProtocolActive = false;
  started = false;
  stopped = false;
  output = "";
  private onInput?: (data: string) => void;

  start(onInput: (data: string) => void): void {
    this.started = true;
    this.onInput = onInput;
  }

  stop(): void {
    this.stopped = true;
  }

  async drainInput(): Promise<void> {}

  write(data: string): void {
    this.output += data;
  }

  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}

  send(data: string): void {
    this.onInput?.(data);
  }
}
