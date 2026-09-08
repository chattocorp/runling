import { describe, expect, expectTypeOf, test } from "vitest";
import { task, Type, type WorkflowExecution } from "runling";
import { defineWebConfig, isWebConfig } from "runling/web";
import { describeWebhook, handleWebhook, prepareWebhook } from "./webhook.ts";
import { z } from "zod";
import * as v from "valibot";
import { toStandardJsonSchema } from "@valibot/to-json-schema";

const joke = task(
  {
    name: "Tell joke",
    input: Type.String(),
    output: Type.String(),
  },
  async (topic) => `A joke about ${topic}`,
);

const config = defineWebConfig({
  webhooks: {
    joke: {
      task: joke,
    },
  },
});

const request = (body: string) =>
  new Request("http://localhost/api/webhooks/joke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

const execution = (output: string): WorkflowExecution<string> => ({
  durationMs: 1,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  output,
  result: { summary: output },
  error: null,
  ok: true,
});

describe("configured webhooks", () => {
  test("runs Zod webhooks with parsed values and exports the correct schema sides", async () => {
    const input = z.object({ count: z.number().default(1) });
    const output = z.object({ count: z.number().default(2) });
    const echo = task({ name: "Zod", input, output }, value => value);
    const config = defineWebConfig({ webhooks: { echo: { task: echo } } });
    expect(isWebConfig(config)).toBe(true);
    const response = await handleWebhook("echo", request("{}"), { config, log: () => {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: { count: 1 } });
    const description = await describeWebhook("echo", { config }).json();
    expect(description.input.required ?? []).not.toContain("count");
    expect(description.output.required).toContain("count");
    expect(description.input).not.toHaveProperty("~standard");
  });

  test("validates async refinements before a webhook run", async () => {
    const echo = task({
      name: "Refined",
      input: z.object({ topic: z.string().refine(async value => value === "ok", "Expected ok") }),
      output: z.string(),
    }, value => value.topic);
    const config = defineWebConfig({ webhooks: { echo: { task: echo } } });
    const response = await handleWebhook("echo", request('{"topic":"bad"}'), {
      config,
      run: async () => { throw new Error("Must not start"); },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ issues: [{ path: "/topic", message: "Expected ok" }] });
  });

  test("passes raw input to the task after webhook validation", async () => {
    const length = task({
      name: "Length",
      input: z.string().transform(value => value.length),
      output: z.number(),
    }, value => value);
    const config = defineWebConfig({ webhooks: { length: { task: length } } });
    const response = await handleWebhook("length", request('"hello"'), { config, log: () => {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: 5 });
  });

  test("accepts Valibot's Standard JSON Schema adapter", async () => {
    const schema = toStandardJsonSchema(v.string());
    const echo = task({ name: "Valibot", input: schema, output: schema }, value => value);
    expectTypeOf<Parameters<typeof echo>>().toEqualTypeOf<[string]>();
    expectTypeOf<ReturnType<typeof echo>>().toEqualTypeOf<Promise<string>>();
    const config = defineWebConfig({ webhooks: { echo: { task: echo } } });
    expect(isWebConfig(config)).toBe(true);
    const response = await handleWebhook("echo", request('"hello"'), { config, log: () => {} });
    expect(await response.json()).toEqual({ output: "hello" });
    expect(await describeWebhook("echo", { config }).json()).toMatchObject({ input: { type: "string" }, output: { type: "string" } });
  });

  test("permits validation-only tasks but requires export for webhooks", async () => {
    const echo = task({ name: "Local", input: v.string(), output: v.string() }, value => value);
    await expect(echo("hello")).resolves.toBe("hello");
    const config = { webhooks: { echo: { task: echo } } };
    expect(isWebConfig(config)).toBe(false);
    expect(() => defineWebConfig(config)).toThrow('Webhook "echo" cannot export task schemas');
  });

  test("rejects output schemas that cannot be exported", () => {
    const echo = task({ name: "Local", input: z.string(), output: z.string().transform(value => value.length) }, value => value);
    const config = { webhooks: { echo: { task: echo } } };
    expect(isWebConfig(config)).toBe(false);
    expect(() => defineWebConfig(config)).toThrow("cannot export task schemas");
  });

  test("preserves task types and hook names without a wrapper", () => {
    expectTypeOf(config.webhooks.joke.task).toEqualTypeOf<typeof joke>();
    expectTypeOf<keyof typeof config.webhooks>().toEqualTypeOf<"joke">();
  });
  test("recognizes schemaful web configurations", () => {
    expect(isWebConfig(config)).toBe(true);
    expect(isWebConfig({ webhooks: { joke: { task: joke } } })).toBe(true);
    expect(isWebConfig({ webhooks: { joke: {} } })).toBe(false);
    expect(isWebConfig({ webhooks: { joke: { workflow: joke } } })).toBe(false);
  });

  test("rejects removed input mappings instead of silently ignoring them", () => {
    expect(
      isWebConfig({
        webhooks: { joke: { task: joke, input: () => "mapped" } },
      }),
    ).toBe(false);
  });

  test.each([
    {
      schema: Type.Object({
        topic: Type.String({ minLength: 1 }),
        count: Type.Integer({ minimum: 1 }),
      }),
      value: { topic: "schemas", count: 2 },
      invalid: { topic: "", count: 0 },
    },
    { schema: Type.Array(Type.String()), value: ["one", "two"], invalid: [1] },
    { schema: Type.Boolean(), value: false, invalid: "false" },
    { schema: Type.Number(), value: 0, invalid: "0" },
    { schema: Type.Null(), value: null, invalid: {} },
  ])(
    "uses the workflow schema directly for $schema.type inputs",
    async ({ schema, value, invalid }) => {
      const echo = task(
        { name: "Echo", input: schema, output: schema },
        (input) => input,
      );
      const direct = defineWebConfig({
        webhooks: { echo: { task: echo } },
      });
      const response = await handleWebhook(
        "echo",
        request(JSON.stringify(value)),
        { config: direct, log: () => {} },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ output: value });
      const rejected = await prepareWebhook(
        "echo",
        request(JSON.stringify(invalid)),
        direct,
      );
      expect(rejected).toBeInstanceOf(Response);
      expect((rejected as Response).status).toBe(400);
    },
  );

  test("rejects malformed JSON before starting a workflow", async () => {
    const result = await prepareWebhook("joke", request("not JSON"), config);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  test("rejects the old wrapped string payload", async () => {
    const result = await prepareWebhook(
      "joke",
      request('{"value":"monorepos"}'),
      config,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  test.each([
    [null],
    [[]],
    [{ type: "not-a-schema-type" }],
    [{ type: "object", properties: { value: { type: "invalid" } } }],
    [{ type: "string", minLength: -1 }],
  ])("rejects removed body schema configuration: %j", (body) => {
    expect(
      isWebConfig({
        webhooks: { joke: { ...config.webhooks.joke, body } },
      }),
    ).toBe(false);
  });

  test.each(["input", "output"] as const)(
    "rejects malformed workflow %s schemas",
    (boundary) => {
      const invalid = Object.assign(() => "unused", {
        input: joke.input,
        output: joke.output,
        [boundary]: { type: "invalid" },
      });
      expect(
        isWebConfig({
          webhooks: { joke: { ...config.webhooks.joke, task: invalid } },
        }),
      ).toBe(false);
    },
  );

  test("runs and serializes an output with undefined optional properties", async () => {
    const optional = task(
      {
        name: "Optional output",
        input: Type.String(),
        output: Type.Object({
          answer: Type.Optional(Type.String()),
          nested: Type.Object({ detail: Type.Optional(Type.String()) }),
        }),
      },
      () => ({ answer: undefined, nested: { detail: undefined } }),
    );
    const logs: unknown[] = [];
    const response = await handleWebhook("optional", request('"hello"'), {
      config: defineWebConfig({
        webhooks: {
          optional: { task: optional },
        },
      }),
      log: (output) => logs.push(output),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: { nested: {} } });
    expect(logs).toEqual([
      { answer: undefined, nested: { detail: undefined } },
    ]);
  });

  test("passes the body directly to the workflow and logs the output", async () => {
    const inputs: unknown[] = [];
    const logs: unknown[] = [];
    const response = await handleWebhook(
      "joke",
      request(JSON.stringify("schemas")),
      {
        config,
        run: async (_workflow, input) => {
          inputs.push(input);
          return execution("A schema walks into a bar.");
        },
        log: (output) => logs.push(output),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      output: "A schema walks into a bar.",
    });
    expect(inputs).toEqual(["schemas"]);
    expect(logs).toEqual(["A schema walks into a bar."]);
  });

  test("rejects a body that does not match its JSON Schema", async () => {
    let runs = 0;
    const response = await handleWebhook("joke", request("{}"), {
      config,
      run: async () => {
        runs++;
        return execution("unused");
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "The request body does not match the workflow input schema.",
      issues: [{ path: "/" }],
    });
    expect(runs).toBe(0);
  });

  test("publishes the webhook and workflow schemas", async () => {
    const response = describeWebhook("joke", { config });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      input: joke.input,
      output: joke.output,
    });
  });

  test("returns not found for an unknown webhook", async () => {
    const response = await handleWebhook("missing", request("{}"), { config });
    expect(response.status).toBe(404);
  });

  test.each(["toString", "constructor", "__proto__"])(
    "returns 404 for inherited name %s",
    async (name) => {
      expect(describeWebhook(name, { config }).status).toBe(404);
      const response = await handleWebhook(name, request("{}"), { config });
      expect(response.status).toBe(404);
    },
  );

  test("permits an explicitly configured name that matches a prototype property", () => {
    const explicit = { webhooks: { constructor: config.webhooks.joke } };
    expect(describeWebhook("constructor", { config: explicit }).status).toBe(
      200,
    );
  });

  test("returns a server error when the workflow fails", async () => {
    const response = await handleWebhook(
      "joke",
      request(JSON.stringify("failure")),
      {
        config,
        run: async () => ({
          ...execution("unused"),
          output: null,
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
