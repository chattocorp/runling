import { handleJokeWebhook } from "$lib/server/joke-webhook.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ request }) =>
  handleJokeWebhook(request);
