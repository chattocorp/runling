import { describe, expect, test } from "bun:test";
import type { WorkflowExecution } from "factory";
import { handleJokeWebhook } from "./joke-webhook.ts";

const request = (body: string) =>
  new Request("http://localhost/api/joke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

const successfulExecution = (joke: string): WorkflowExecution => ({
  durationMs: 1,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  result: { summary: joke },
  error: null,
  ok: true,
});

describe("joke webhook", () => {
  test("passes the webhook value to the workflow and logs the joke", async () => {
    const values: string[] = [];
    const logs: string[] = [];
    const response = await handleJokeWebhook(
      request(JSON.stringify({ value: "monorepos" })),
      {
        run: async (value) => {
          values.push(value);
          return successfulExecution("A monorepo walks into a bar.");
        },
        log: (joke) => logs.push(joke),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      joke: "A monorepo walks into a bar.",
    });
    expect(values).toEqual(["monorepos"]);
    expect(logs).toEqual(["A monorepo walks into a bar."]);
  });

  test("rejects an invalid body without running the workflow", async () => {
    let runs = 0;
    const response = await handleJokeWebhook(request("{}"), {
      run: async () => {
        runs += 1;
        return successfulExecution("unused");
      },
    });

    expect(response.status).toBe(400);
    expect(runs).toBe(0);
  });

  test("returns a server error when the workflow fails", async () => {
    const response = await handleJokeWebhook(
      request(JSON.stringify({ value: "failure" })),
      {
        run: async () => ({
          ...successfulExecution("unused"),
          result: null,
          error: "Agent failed",
          ok: false,
        }),
      },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Agent failed" });
  });
});
