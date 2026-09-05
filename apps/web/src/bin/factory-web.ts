#!/usr/bin/env bun

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const usage = `Usage: factory-web [options]

Options:
  --host <host>  Hostname to listen on (default: localhost)
  --port <port>  Port to listen on (default: 5173)
  --open         Open the app in a browser
  -h, --help     Show this help`;

export interface FactoryWebArguments {
  help: boolean;
  host: string;
  open: boolean;
  port: number;
}

export function parseFactoryWebArguments(
  argv: readonly string[],
): FactoryWebArguments {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      help: { type: "boolean", short: "h", default: false },
      host: { type: "string", default: "localhost" },
      open: { type: "boolean", default: false },
      port: { type: "string", default: "5173" },
    },
    allowPositionals: false,
    strict: true,
  });
  const port = Number(parsed.values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer from 1 through 65535");
  }

  return {
    help: parsed.values.help ?? false,
    host: parsed.values.host ?? "localhost",
    open: parsed.values.open ?? false,
    port,
  };
}

export async function runFactoryWeb(
  argv: readonly string[] = Bun.argv.slice(2),
): Promise<void> {
  const options = parseFactoryWebArguments(argv);
  if (options.help) {
    console.log(usage);
    return;
  }

  const appRoot = resolve(import.meta.dir, "../..");
  process.env.FACTORY_WEB_WORKFLOW_CWD = process.cwd();
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

if (import.meta.main) {
  try {
    await runFactoryWeb();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
