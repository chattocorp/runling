import { expect, test } from "bun:test";
import {
  observeFactoryEvents,
  withFactoryActivity,
  type FactoryEvent,
} from "./events.ts";
import { createInput, InputUnavailableError } from "./input.ts";

test("delegates input to the host and reports its lifecycle", async () => {
  const events: FactoryEvent[] = [];
  const input = createInput(async (request) => {
    expect(request.message).toBe("Which environment?");
    expect(request.defaultValue).toBe("staging");
    return "production";
  });

  const answer = await observeFactoryEvents(
    (event) => events.push(event),
    () =>
      withFactoryActivity("deploy", () =>
        input("Which environment?", { defaultValue: "staging" }),
      ),
  );

  expect(answer).toBe("production");
  const requested = events.find((event) => event.type === "input.requested");
  const finished = events.find((event) => event.type === "input.finished");
  const logs = events.filter((event) => event.type === "log");

  expect(requested).toMatchObject({
    type: "input.requested",
    activityId: "deploy",
    message: "Which environment?",
    defaultValue: "staging",
  });
  expect(finished).toMatchObject({
    type: "input.finished",
    id: requested?.type === "input.requested" ? requested.id : undefined,
    status: "answered",
    value: "production",
  });
  expect(logs.map(({ message }) => Bun.stripANSI(message))).toEqual([
    "Asking Which environment?",
    "Answered production",
  ]);
  expect(logs.every((event) => event.source === "input")).toBe(true);
});

test("fails clearly when the host has no input handler", async () => {
  await expect(createInput()("Choose wisely")).rejects.toBeInstanceOf(
    InputUnavailableError,
  );
});

test("rejects invalid host responses", async () => {
  const input = createInput(async () => 42 as never);

  await expect(input("What is the answer?")).rejects.toThrow(
    "An input handler must return a string",
  );
});
