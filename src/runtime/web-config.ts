import { isSchemaTask, type Task } from "./workflow.ts";
import { toJsonSchema, type WorkflowSchema, type SchemaInput } from "./schema.ts";

/** Route a validated raw payload before a run exists. Return null when handled. */
export type WebhookRouter<Input = unknown> = <Result>(
  input: Input,
  start: () => Promise<Result>,
) => Promise<Result | null>;

export interface WebhookDefinition<
  InputSchema extends WorkflowSchema,
  OutputSchema extends WorkflowSchema,
> {
  task: Task<InputSchema, OutputSchema>;
  route?: WebhookRouter<SchemaInput<InputSchema>>;
}

// Accept heterogeneous task signatures; defineWebConfig preserves each concrete type.
type AnyWebhookDefinition = {
  route?: WebhookRouter<any>;
  task: ((...args: any[]) => unknown) &
    Pick<Task, "name" | "input" | "output">;
};

export interface WebConfig<
  Webhooks extends Record<string, AnyWebhookDefinition> = Record<
    string,
    AnyWebhookDefinition
  >,
> {
  webhooks: Webhooks;
}

/** Preserve webhook names and schema types in a Runling web configuration. */
export function defineWebConfig<
  const Webhooks extends Record<string, AnyWebhookDefinition>,
>(config: WebConfig<Webhooks>): WebConfig<Webhooks> {
  for (const [name, definition] of Object.entries(config.webhooks)) {
    try {
      if (definition.route !== undefined && typeof definition.route !== "function") throw new TypeError("route must be a function");
      describeTaskSchemas(definition.task);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new TypeError(`Webhook ${JSON.stringify(name)} cannot export task schemas: ${message}`, { cause });
    }
  }
  return config;
}

/** Get JSON Schema descriptions for a webhook task. */
export function describeTaskSchemas(task: Pick<Task, "input" | "output">) {
  return {
    input: toJsonSchema(task.input, "input"),
    output: toJsonSchema(task.output, "output"),
  };
}

/** Check the runtime shape of a Runling web configuration. */
export function isWebConfig(value: unknown): value is WebConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    !("webhooks" in value) ||
    typeof value.webhooks !== "object" ||
    value.webhooks === null ||
    Array.isArray(value.webhooks)
  ) {
    return false;
  }

  const valid = Object.values(value.webhooks).every(
    (definition) =>
      typeof definition === "object" &&
      definition !== null &&
      "task" in definition &&
      isSchemaTask(definition.task) &&
      (!("route" in definition) || definition.route === undefined || typeof definition.route === "function") &&
      !("body" in definition) &&
      !("input" in definition),
  );
  if (!valid) return false;
  try {
    for (const definition of Object.values(value.webhooks) as AnyWebhookDefinition[]) {
      describeTaskSchemas(definition.task);
    }
    return true;
  } catch {
    return false;
  }
}
