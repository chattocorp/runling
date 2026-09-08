import { loadWebConfig } from "$lib/server/web-config.ts";
import { getRunStore } from "$lib/server/run-store.ts";
import type { PageServerLoad } from "./$types";
import type { WebhookInfo } from "$lib/runs.ts";

export const load: PageServerLoad = async () => {
  const config = await loadWebConfig();
  const webhooks = Object.entries(config.webhooks).map(
    ([name, definition]) => ({
      name,
      workflow: definition.task.name,
      path: `/api/webhooks/${encodeURIComponent(name)}`,
      input: definition.task.input,
      output: definition.task.output,
    }),
  );
  // Strip non-JSON TypeBox metadata before SvelteKit serializes the page data.
  return {
    webhooks: JSON.parse(JSON.stringify(webhooks)) as WebhookInfo[],
    runs: (await getRunStore()).list(),
  };
};
