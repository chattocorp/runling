import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { ConfigReloader } from "./config-reloader.ts";

async function fixture(run: (loader: ConfigReloader, path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "runling-config-test-"));
  const path = join(directory, "runling.config.ts");
  const loader = new ConfigReloader(path);
  try {
    await run(loader, path);
  } finally {
    await loader.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("starts empty without a config and watches for its creation", async () => {
  await fixture(async (loader, path) => {
    expect(await loader.load()).toEqual({ webhooks: {} });
    expect(loader.error).toBeUndefined();
    expect(await loader.reload()).toEqual({ webhooks: {} });
    expect(loader.error).toBeUndefined();
    const revision = loader.revision;
    await writeFile(path, "export default { webhooks: {} };\n");
    await vi.waitFor(() => expect(loader.revision).toBeGreaterThan(revision), { timeout: 5000 });
    expect(loader.error).toBeUndefined();
  });
});

test("retains a previously loaded config if the file is removed", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await fixture(async (loader, path) => {
      await writeFile(path, "export default { webhooks: {} };\n");
      const config = await loader.load();
      await rm(path);
      expect(await loader.reload()).toBe(config);
      expect(loader.error).toBeDefined();
    });
  } finally {
    log.mockRestore();
  }
});

test("rejects an existing invalid config and missing imports", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await fixture(async (loader, path) => {
      await writeFile(path, "export default { invalid: true };\n");
      await expect(loader.load()).rejects.toThrow("valid Runling configuration");
    });
    await fixture(async (loader, path) => {
      await writeFile(path, "import './missing.ts'; export default { webhooks: {} };\n");
      await expect(loader.load()).rejects.toThrow();
    });
  } finally {
    log.mockRestore();
  }
});
