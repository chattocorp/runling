import { isWorkflow, type Workflow } from "./workflow.ts";
import type { TSchema } from "typebox";

export interface WebhookDefinition<
  WorkflowInputSchema extends TSchema,
  WorkflowOutputSchema extends TSchema,
> {
  workflow: Workflow<WorkflowInputSchema, WorkflowOutputSchema>;
}

// Accept heterogeneous workflow signatures; defineWebConfig preserves each concrete type.
type AnyWebhookDefinition = {
  workflow: ((...args: any[]) => unknown) &
    Pick<Workflow, "name" | "input" | "output">;
};

export interface WebConfig<
  Webhooks extends Record<string, AnyWebhookDefinition> = Record<
    string,
    AnyWebhookDefinition
  >,
> {
  webhooks: Webhooks;
}

/** Preserve webhook names and schema types in a Factory web configuration. */
export function defineWebConfig<
  const Webhooks extends Record<string, AnyWebhookDefinition>,
>(config: WebConfig<Webhooks>): WebConfig<Webhooks> {
  return config;
}

/** Check the runtime shape of a Factory web configuration. */
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
      "workflow" in definition &&
      isWorkflow(definition.workflow) &&
      !("body" in definition) &&
      !("input" in definition),
  );
}
