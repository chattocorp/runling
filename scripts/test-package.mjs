import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, delimiter } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
// Keep npm and its child executables on the runtime used to launch this test.
process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`;
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(resolve(tmpdir(), "factory-consumer-"));
let server;
let serverOutput = "";
try {
  const { stdout } = await exec(
    "npm",
    ["pack", "--json", "--pack-destination", directory],
    { cwd: resolve(root, "packages/factory") },
  );
  const [packed] = JSON.parse(stdout);
  assert(packed.files.some(({ path }) => path === "dist/web/index.js"));
  assert(packed.files.some(({ path }) => path === "dist/src/index.d.ts"));
  assert(!packed.files.some(({ path }) => path.endsWith(".test.ts")));
  const project = resolve(directory, "project with spaces");
  await mkdir(project);
  await writeFile(
    resolve(project, "package.json"),
    JSON.stringify({
      name: "factory-consumer-test",
      private: true,
      type: "module",
      scripts: { factory: "factory" },
    }),
  );
  await exec(
    "npm",
    ["install", "--no-audit", "--no-fund", resolve(directory, packed.filename)],
    { cwd: project, maxBuffer: 8 * 1024 * 1024 },
  );
  await writeFile(resolve(project, "message.txt"), "consumer cwd");
  await writeFile(
    resolve(project, ".env"),
    "FACTORY_PACKAGE_TEST_ENV=loaded\n",
  );
  await writeFile(
    resolve(project, "workflow.ts"),
    `import { Type, workflow } from "factory";
export default workflow({ name: "Consumer echo", input: Type.Object({ topic: Type.String() }), output: Type.String() }, async (f, input) => {
  return f.step("Echo input", async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    const cwd = await f.exec\`node -e \${"process.stdout.write(require('node:fs').readFileSync('message.txt', 'utf8'))"}\`.text();
    f.log.info(input.topic);
    return input.topic + ": " + cwd;
  });
});
`,
  );
  await writeFile(
    resolve(project, "cli.ts"),
    `import { Type, workflow } from "factory";
export default workflow({ name: "CLI echo", input: Type.String(), output: Type.String() }, (_f, input) => {
  if (process.env.FACTORY_PACKAGE_TEST_ENV !== "loaded") throw new Error("Project .env was not loaded");
  return input;
});
`,
  );
  await writeFile(
    resolve(project, "factory.web.ts"),
    `import { defineWebConfig } from "factory/web";
import echo from "./workflow.ts";
export default defineWebConfig({ webhooks: { echo: { workflow: echo } } });
`,
  );
  const cli = await exec(
    "npm",
    ["run", "--silent", "factory", "--", "cli.ts", "explicit input", "--json"],
    { cwd: project },
  );
  assert.equal(JSON.parse(cli.stdout).output, "explicit input");
  // A normal npm project need not declare itself an ESM package.
  await writeFile(
    resolve(project, "package.json"),
    JSON.stringify({
      name: "factory-consumer-test",
      private: true,
      scripts: { factory: "factory" },
      dependencies: { factory: "0.0.0" },
    }),
  );
  const commonjsCli = await exec(
    "npm",
    [
      "run",
      "--silent",
      "factory",
      "--",
      "cli.ts",
      "commonjs project",
      "--json",
    ],
    { cwd: project },
  );
  assert.equal(JSON.parse(commonjsCli.stdout).output, "commonjs project");
  await exec(
    process.execPath,
    [
      resolve(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "nodenext",
      "--target",
      "esnext",
      "--allowImportingTsExtensions",
      "--skipLibCheck",
      "factory.web.ts",
      "workflow.ts",
      "cli.ts",
    ],
    { cwd: project },
  );

  const portServer = createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    "npm",
    ["run", "factory", "--", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: project,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      response = await fetch(origin);
      break;
    } catch {
      await delay(100);
    }
  }
  assert(response, `Server did not start:\n${serverOutput}`);
  const html = await response.text();
  assert.equal(response.status, 200, html + serverOutput);
  assert(html.includes("Consumer echo"));
  const asset = html.match(/(?:href|src)="([^" ]+\.css)"/)?.[1];
  assert(asset, "UI contains a stylesheet");
  assert.equal((await fetch(new URL(asset, origin))).status, 200);
  assert.equal((await fetch(`${origin}/api/webhooks/echo`)).status, 200);
  const post = (path, body) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post("/api/webhooks/echo", "invalid")).status, 400);
  const webhook = await post("/api/webhooks/echo", { topic: "webhook" });
  assert.equal(webhook.status, 200);
  assert.deepEqual(await webhook.json(), { output: "webhook: consumer cwd" });
  const started = await post("/api/runs/start/echo", { topic: "console" });
  assert.equal(started.status, 202);
  const { id } = await started.json();
  const streamAbort = new AbortController();
  const stream = await fetch(`${origin}/api/runs/${id}/events`, {
    signal: streamAbort.signal,
  });
  const reader = stream.body.getReader();
  let streamed = "";
  try {
    await Promise.race([
      (async () => {
        while (!streamed.includes('"type":"finished"')) {
          const { value, done } = await reader.read();
          if (done) break;
          streamed += new TextDecoder().decode(value);
        }
      })(),
      delay(5000).then(() => {
        throw new Error("Timed out waiting for live events: " + streamed);
      }),
    ]);
  } finally {
    streamAbort.abort();
  }
  const detail = await (await fetch(`${origin}/api/runs/${id}`)).json();
  assert.equal(detail.status, "completed");
  assert(
    streamed.includes("command.started"),
    "Workflow and web UI share the event runtime",
  );
  const history = await readFile(
    resolve(project, ".factory/runs", `${id}.jsonl`),
    "utf8",
  );
  assert(history.includes("console: consumer cwd"));
  console.log(
    "Packed npm consumer passed: CLI, UI/assets, TS config, webhook, live events, and history.",
  );
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  if (server && server.exitCode === null) {
    if (process.platform === "win32") server.kill();
    else process.kill(-server.pid, "SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(5000),
    ]);
  }
  await rm(directory, { recursive: true, force: true });
}
