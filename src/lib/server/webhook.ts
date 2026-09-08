import { runWorkflow, validateSchema, type Task, type WorkflowExecution } from "runling";
import { describeTaskSchemas, type WebConfig } from "runling/web";

type WebhookRunner = (
  workflow: Task,
  input: unknown,
) => Promise<WorkflowExecution>;

export interface WebhookDependencies {
  config: WebConfig;
  log?: (output: unknown) => void;
  run?: WebhookRunner;
}

const runConfiguredWorkflow: WebhookRunner = (workflow, input) =>
  runWorkflow(workflow, {
    input,
  });

const json = (body: unknown, status = 200) => Response.json(body, { status });

export function describeWebhook(
  name: string,
  { config }: Pick<WebhookDependencies, "config">,
): Response {
  if (!Object.hasOwn(config.webhooks, name)) {
    return json({ error: `Unknown webhook ${JSON.stringify(name)}.` }, 404);
  }
  const definition = config.webhooks[name]!;

  return json(describeTaskSchemas(definition.task));
}

export async function handleWebhook(
  name: string,
  request: Request,
  {
    config,
    log = (output) => console.log(output),
    run = runConfiguredWorkflow,
  }: WebhookDependencies,
): Promise<Response> {
  const prepared = await prepareWebhook(name, request, config);
  if (prepared instanceof Response) return prepared;
  const execution = await run(prepared.task, prepared.input);
  if (!execution.ok) {
    return json({ error: execution.error ?? "The workflow failed." }, 500);
  }
  log(execution.output);
  return json({ output: execution.output });
}

export async function prepareWebhook(
  name: string,
  request: Request,
  config: WebConfig,
): Promise<Response | { task: Task; input: unknown }> {
  if (!Object.hasOwn(config.webhooks, name)) {
    return json({ error: `Unknown webhook ${JSON.stringify(name)}.` }, 404);
  }
  const definition = config.webhooks[name]!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "The request body must be valid JSON." }, 400);
  }

  const result = await validateSchema(definition.task.input, body);
  if (result.issues) {
    return json(
      {
        error: "The request body does not match the workflow input schema.",
        issues: result.issues,
      },
      400,
    );
  }

  // Pass the original input. The task parses it when the run starts.
  return { task: definition.task, input: body };
}
