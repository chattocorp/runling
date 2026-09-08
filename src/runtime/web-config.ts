import { isTask, type Task } from "./workflow.ts";
import type { TSchema } from "typebox";

export interface WebhookDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  task: Task<InputSchema, OutputSchema>;
}

// Accept heterogeneous task signatures; defineWebConfig preserves each concrete type.
type AnyWebhookDefinition = {
  task: ((...args: any[]) => Promise<unknown>) &
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
  return config;
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

  return Object.values(value.webhooks).every(
    (definition) =>
      typeof definition === "object" &&
      definition !== null &&
      "task" in definition &&
      isTask(definition.task) &&
      !("body" in definition) &&
      !("input" in definition),
  );
}
