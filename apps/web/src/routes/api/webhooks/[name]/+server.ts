import { loadWebConfig } from "$lib/server/web-config.ts";
import { describeWebhook, handleWebhook } from "$lib/server/webhook.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) =>
  describeWebhook(params.name, { config: await loadWebConfig() });

export const POST: RequestHandler = async ({ params, request }) =>
  handleWebhook(params.name, request, { config: await loadWebConfig() });
