import { isWorkflow, isWorkflowSchema, type Static, type TSchema, type Workflow } from "factory";

export interface WebhookDefinition<
  BodySchema extends TSchema,
  WorkflowInputSchema extends TSchema,
  WorkflowOutputSchema extends TSchema,
> {
  body: BodySchema;
  workflow: Workflow<WorkflowInputSchema, WorkflowOutputSchema>;
  input: (
    body: Static<BodySchema>,
    request: Request,
  ) => Promise<Static<WorkflowInputSchema>> | Static<WorkflowInputSchema>;
}

type AnyWebhookDefinition = WebhookDefinition<TSchema, TSchema, TSchema>;

export interface WebConfig<
  Webhooks extends Record<string, AnyWebhookDefinition> = Record<
    string,
    AnyWebhookDefinition
  >,
> {
  webhooks: Webhooks;
}

/** Preserve schema inference when defining one HTTP webhook. */
export function webhook<
  const BodySchema extends TSchema,
  const WorkflowInputSchema extends TSchema,
  const WorkflowOutputSchema extends TSchema,
>(
  definition: WebhookDefinition<
    BodySchema,
    WorkflowInputSchema,
    WorkflowOutputSchema
  >,
): WebhookDefinition<BodySchema, WorkflowInputSchema, WorkflowOutputSchema> {
  return definition;
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
      "body" in definition &&
      isWorkflowSchema(definition.body) &&
      "workflow" in definition &&
      isWorkflow(definition.workflow) &&
      "input" in definition &&
      typeof definition.input === "function",
  );
}
