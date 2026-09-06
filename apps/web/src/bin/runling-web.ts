#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { isWebConfig } from "runling/web";
import { parseRunlingWebArguments } from "../../../../packages/runling/src/web-server.ts";
export { parseRunlingWebArguments } from "../../../../packages/runling/src/web-server.ts";

const usage = `Usage: runling-web [options]

Options:
  --config <path>  Configuration file (default: runling.config.ts)
  --host <host>  Hostname to listen on (default: localhost)
  --port <port>  Port to listen on (default: 5173)
  --open         Open the app in a browser
  -h, --help     Show this help`;

export async function runRunlingWeb(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const options = parseRunlingWebArguments(argv);
  if (options.help) {
    console.log(usage);
    return;
  }

  const appRoot = resolve(import.meta.dirname, "../..");
  const workflowCwd = process.cwd();
  const configPath = resolve(workflowCwd, options.config);
  if (existsSync(configPath)) {
    const configModule = await import(pathToFileURL(configPath).href);
    if (!isWebConfig(configModule.default)) {
      throw new Error(
        `${configPath} must export a valid Runling web configuration`,
      );
    }
  }

  process.env.RUNLING_WEB_CONFIG = configPath;
  process.env.RUNLING_WEB_WORKFLOW_CWD = workflowCwd;
  process.chdir(appRoot);

  const server = await createServer({
    root: appRoot,
    configFile: resolve(appRoot, "vite.config.ts"),
    clearScreen: false,
    server: {
      host: options.host,
      open: options.open,
      port: options.port,
      strictPort: true,
    },
  });

  await server.listen();
  server.printUrls();
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await runRunlingWeb();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
