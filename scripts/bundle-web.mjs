import { cp, rm } from "node:fs/promises";

const destination = new URL("../packages/factory/dist/web", import.meta.url);
await rm(destination, { recursive: true, force: true });
await cp(new URL("../apps/web/build", import.meta.url), destination, {
  recursive: true,
});
