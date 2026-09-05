import { runWorkflow, type Workflow, type WorkflowExecution } from "factory";
import type { WebConfig } from "factory-web";
import { Check, Errors } from "typebox/value";

type WebhookRunner = (
  workflow: Workflow,
  input: unknown,
) => Promise<WorkflowExecution>;

export interface WebhookDependencies {
  config: WebConfig;
  log?: (output: unknown) => void;
  run?: WebhookRunner;
}

const runConfiguredWorkflow: WebhookRunner = (workflow, input) =>
  runWorkflow(workflow, {
    cwd: process.env.FACTORY_WEB_WORKFLOW_CWD,
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

  return json({
    input: definition.workflow.input,
    output: definition.workflow.output,
  });
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
  const execution = await run(prepared.workflow, prepared.input);
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
): Promise<Response | { workflow: Workflow; input: unknown }> {
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

  if (!Check(definition.workflow.input, body)) {
    return json(
      {
        error: "The request body does not match the workflow input schema.",
        issues: Errors(definition.workflow.input, body).map(
          ({ instancePath, message }) => ({
            path: instancePath === "" ? "/" : instancePath,
            message,
          }),
        ),
      },
      400,
    );
  }

  return { workflow: definition.workflow, input: body };
}
