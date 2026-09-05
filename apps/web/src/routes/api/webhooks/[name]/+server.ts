import { loadWebConfig } from "$lib/server/web-config.ts";
import { describeWebhook, handleWebhook } from "$lib/server/webhook.ts";
import type { RequestHandler } from "./$types";
import { getRunStore } from "$lib/server/run-store.ts";

export const GET: RequestHandler = async ({ params }) =>
  describeWebhook(params.name, { config: await loadWebConfig() });

export const POST: RequestHandler = async ({ params, request }) => {
  const store = await getRunStore();
  return handleWebhook(params.name, request, {
    config: await loadWebConfig(),
    log: () => {}, // The store logs output for both webhook and browser runs.
    run: async (workflow, input) => {
      const run = await store.start(params.name, workflow, input, "webhook");
      return run.completion;
    },
  });
};
