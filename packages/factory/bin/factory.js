#!/usr/bin/env node
import "tsx/esm";
import { existsSync } from "node:fs";

try {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  if (
    args.length === 0 ||
    args[0] === "web" ||
    ["--config", "--host", "--port", "--open", "--help", "-h"].includes(args[0].split("=")[0])
  ) {
    const { runFactoryWeb } = await import("../dist/src/web-server.js");
    await runFactoryWeb(args[0] === "web" ? args.slice(1) : args);
  } else {
    const { runFactory } = await import("../dist/src/runner.js");
    await runFactory(args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
