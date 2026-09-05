#!/usr/bin/env node
import "tsx/esm";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "./workflow-loader.js";

registerHooks({ resolve });

try {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  if (
    args.length === 0 ||
    args[0] === "web" ||
    ["--config", "--host", "--port", "--open", "--help", "-h"].includes(args[0].split("=")[0])
  ) {
    const { runRunlingWeb } = await import("../dist/src/web-server.js");
    await runRunlingWeb(args[0] === "web" ? args.slice(1) : args);
  } else {
    const { runRunling } = await import("../dist/src/runner.js");
    await runRunling(args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
