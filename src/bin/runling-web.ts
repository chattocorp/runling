#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { CommanderError } from "commander";
import { createServeCommand, type ServeOptions } from "../runtime/cli.ts";

export async function runRunlingWeb(options: ServeOptions): Promise<void> {
  const appRoot = resolve(import.meta.dirname, "../..");
  const workflowCwd = process.cwd();
  const configPath = resolve(workflowCwd, options.config);
  process.env.RUNLING_WEB_CONFIG = configPath;
  process.env.RUNLING_WEB_WORKFLOW_CWD = workflowCwd;
  process.chdir(appRoot);

  const server = await createServer({
    root: appRoot,
    configFile: resolve(appRoot, "vite.config.ts"),
    clearScreen: false,
    ssr: { resolve: { externalConditions: ["runling-source"] } },
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
    await createServeCommand()
      .name("runling-web")
      .exitOverride()
      .action(runRunlingWeb)
      .parseAsync(process.argv);
  } catch (cause) {
    if (cause instanceof CommanderError) {
      process.exitCode = cause.exitCode;
    } else {
      console.error(cause instanceof Error ? cause.message : String(cause));
      process.exitCode = 1;
    }
  }
}
