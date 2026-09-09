import { serverLog } from "../../runtime/server-log.ts";
import { runWorkflow, validateSchema, type Task, type WorkflowExecution } from "runling";
import { describeTaskSchemas, type WebhookRouter, type WebConfig } from "runling/web";

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
  const execution = await routeWebhook(prepared, () => run(prepared.task, prepared.input));
  if (execution === null) return json({ handled: true }, 202);
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
): Promise<Response | { task: Task; input: unknown; route?: WebhookRouter<any> }> {
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
  return { task: definition.task, input: body, route: definition.route };
}

/** A router may start at most one run for this delivery. */
export async function routeWebhook<Result>(
  prepared: { input: unknown; route?: WebhookRouter<any> },
  start: () => Promise<Result>,
): Promise<Result | null> {
  let started: Promise<Result> | undefined;
  const once = () => {
    started ??= Promise.resolve().then(start);
    // A misbehaving router must not create an unhandled start rejection.
    void started.catch(() => {});
    return started;
  };
  if (!prepared.route) return once();
  const result = await prepared.route(prepared.input, once);
  if (!started && result === null) serverLog("info", "webhook.handled", { startedRun: false });
  return started ?? result;
}
