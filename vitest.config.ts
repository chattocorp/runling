import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^factory$/,
        replacement: fileURLToPath(
          new URL("./packages/factory/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^factory\/web$/,
        replacement: fileURLToPath(
          new URL("./packages/factory/src/web-config.ts", import.meta.url),
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
