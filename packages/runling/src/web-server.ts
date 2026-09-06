import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer, type RequestListener } from "node:http";

export function parseRunlingWebArguments(argv: readonly string[]) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      config: { type: "string", default: "runling.config.ts" },
      host: { type: "string", default: "localhost" },
      port: { type: "string", default: "5173" },
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Port must be an integer from 1 through 65535");
  return { ...values, port };
}

export async function runRunlingWeb(argv = process.argv.slice(2)) {
  const options = parseRunlingWebArguments(argv);
  if (options.help) {
    console.log(`Usage: runling [web] [--config runling.config.ts] [--host localhost] [--port 5173] [--open]
       runling <workflow.ts> [prompt] [--log|--json]

With no arguments, start the web UI in the current project.`);
    return;
  }
  const cwd = process.cwd();
  const configPath = resolve(cwd, options.config);
  process.env.RUNLING_WEB_CONFIG = configPath;
  process.env.RUNLING_WEB_WORKFLOW_CWD = cwd;
  process.env.HOST = options.host;
  process.env.PORT = String(options.port);
  // Import only after setting the adapter's startup environment. Keep the project cwd.
  const serverUrl = new URL("../web/handler.js", import.meta.url);
  if (!existsSync(serverUrl))
    throw new Error(
      "Runling web assets are missing. Build the package before running it.",
    );
  const { handler } = (await import(/* @vite-ignore */ serverUrl.href)) as {
    handler: RequestListener;
  };
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  console.log(`Runling listening on http://${host}:${options.port}`);
  const shutdown = () => {
    server.close(() => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
    });
    setTimeout(() => server.closeAllConnections(), 5000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  if (options.open) {
    const { spawn } = await import("node:child_process");
    const host = options.host.includes(":")
      ? `[${options.host}]`
      : options.host;
    const url = `http://${host}:${options.port}`;
    const child =
      process.platform === "darwin"
        ? spawn("open", [url])
        : process.platform === "win32"
          ? spawn("explorer.exe", [url])
          : spawn("xdg-open", [url]);
    child.on("error", () => console.warn(`Open ${url} in your browser.`));
    child.unref();
  }
}
