import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^runling$/,
        replacement: fileURLToPath(
          new URL("./packages/runling/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^runling\/web$/,
        replacement: fileURLToPath(
          new URL("./packages/runling/src/web-config.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
