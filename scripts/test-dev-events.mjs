import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const directory = await mkdtemp(join(tmpdir(), "runling-dev-events-"));
const configPath = join(directory, "runling.config.ts");
await writeFile(configPath, `
  import { task, input, Type } from "runling";
  export default { webhooks: { probe: { task: task({
    name: "Event probe", input: Type.String(), output: Type.String(),
  }, async (ctx, value) => input({ ...ctx, onInput: async () => value }, "Question?")) } } };
`);
process.env.RUNLING_WEB_CONFIG = configPath;
// Match pnpm dev: the config loader and web host must use the same native runtime.
const server = await createServer({
  server: { middlewareMode: true },
  ssr: { resolve: { externalConditions: ["runling-source"] } },
});
let loader;
try {
  const configModule = await server.ssrLoadModule("/src/lib/server/web-config.ts");
  const { RunStore } = await server.ssrLoadModule("/src/lib/server/run-store.ts");
  loader = configModule.getConfigReloader();
  const config = await loader.load();
  const store = new RunStore(join(directory, "runs"));
  await store.init();
  const { id, completion } = await store.start("probe", config.webhooks.probe.task, "Answer", "web");
  await completion;
  const run = await store.get(id);
  assert.equal(run.status, "completed");
  assert.equal(run.output, "Answer");
  assert.deepEqual(run.events.filter((event) => event.type !== "log").map((event) => event.type), [
    "step.started", "input.requested", "input.finished", "step.finished",
  ]);
  const restored = new RunStore(join(directory, "runs"));
  await restored.init();
  assert.deepEqual((await restored.get(id)).events, run.events);
} finally {
  await loader?.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
