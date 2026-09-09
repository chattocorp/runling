import { getRunStore } from "$lib/server/run-store.ts";
import { loadWebConfig } from "$lib/server/web-config.ts";
import { prepareWebhook, routeWebhook } from "$lib/server/webhook.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
  const prepared = await prepareWebhook(
    params.name,
    request,
    await loadWebConfig(),
  );
  if (prepared instanceof Response) return prepared;
  const store = await getRunStore();
  const started = await routeWebhook(prepared, () => store.start(
    params.name,
    prepared.task,
    prepared.input,
    "web",
  ));
  if (started === null) return Response.json({ handled: true }, { status: 202 });
  const { id } = started;
  return Response.json({ id }, { status: 202 });
};
