import { getRunStore } from "$lib/server/run-store.ts";
import { loadWebConfig } from "$lib/server/web-config.ts";
import { prepareWebhook } from "$lib/server/webhook.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
  const prepared = await prepareWebhook(
    params.name,
    request,
    await loadWebConfig(),
  );
  if (prepared instanceof Response) return prepared;
  const store = await getRunStore();
  const { id } = await store.start(
    params.name,
    prepared.workflow,
    prepared.input,
    "web",
  );
  return Response.json({ id }, { status: 202 });
};
