import { runWorkflow, type WorkflowExecution } from "factory";
import { joke } from "../../../../../workflows/joke.ts";

type JokeRunner = (value: string) => Promise<WorkflowExecution>;

export interface JokeWebhookDependencies {
  log?: (joke: string) => void;
  run?: JokeRunner;
}

const runJoke: JokeRunner = (value) =>
  runWorkflow(joke, {
    cwd: process.env.FACTORY_WEB_WORKFLOW_CWD,
    prompt: value,
  });

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

export async function handleJokeWebhook(
  request: Request,
  { log = console.log, run = runJoke }: JokeWebhookDependencies = {},
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "The request body must be valid JSON." }, 400);
  }

  const value =
    typeof body === "object" && body !== null && "value" in body
      ? body.value
      : undefined;

  if (typeof value !== "string" || value.trim() === "") {
    return json({ error: 'The request body must contain a non-empty "value" string.' }, 400);
  }

  const execution = await run(value);
  if (!execution.ok || execution.result === null) {
    return json(
      { error: execution.error ?? "The joke workflow returned no result." },
      500,
    );
  }

  const generatedJoke = execution.result.summary;
  log(generatedJoke);

  return json({ joke: generatedJoke });
}
