import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Type, workflow, recordTokenUsage } from "factory";
import { RunStore } from "./run-store.ts";
import { buildTimeline } from "../timeline.ts";
import type { RunRecord } from "../runs.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function store() {
  const directory = await mkdtemp(resolve(tmpdir(), "factory-runs-test-"));
  directories.push(directory);
  const store = new RunStore(directory, directory);
  await store.init();
  return store;
}

test("streams ordered nested events and restores the completed run", async () => {
  const original = await store();
  const records: RunRecord[] = [];
  const unsubscribe = original.subscribe((_id, record) => records.push(record));
  const nested = workflow(
    { name: "Nested", input: Type.String(), output: Type.String() },
    async (f, input) => {
      f.log.info("Inside nested workflow");
      return input.toUpperCase();
    },
  );
  const parent = workflow(
    { name: "Parent", input: Type.String(), output: Type.String() },
    (f, input) => nested(f, input),
  );
  const run = await original.start("test", parent, "hello", "web");
  await run.completion;
  unsubscribe();
  const result = original.get(run.id)!;
  expect(result.status).toBe("completed");
  expect(result.output).toBe("HELLO");
  expect(records[0]?.type).toBe("started");
  expect(records.at(-1)?.type).toBe("finished");
  const timeline = buildTimeline(result.events, result.status);
  expect(timeline[0]?.label).toBe("Parent");
  expect(timeline[0]?.children[0]?.label).toBe("Nested");
  expect(timeline[0]?.children[0]?.status).toBe("completed");
  expect(timeline[0]?.children[0]?.logs).toContain("Inside nested workflow");
  const restored = new RunStore(original.directory, original.cwd);
  await restored.init();
  expect(restored.get(run.id)).toEqual(JSON.parse(JSON.stringify(result)));
  expect(restored.get("../../outside")).toBeUndefined();
});

test("records failures and keeps concurrent token totals separate", async () => {
  const history = await store();
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const slow = workflow(
    { name: "Slow", input: Type.String(), output: Type.String() },
    async () => {
      recordTokenUsage({ input: 10, output: 1, cacheRead: 0, cacheWrite: 0 });
      ready.resolve();
      await release.promise;
      recordTokenUsage({ input: 20, output: 2, cacheRead: 0, cacheWrite: 0 });
      return "Slow done";
    },
  );
  const fast = workflow(
    { name: "Fast", input: Type.String(), output: Type.String() },
    () => {
      recordTokenUsage({ input: 100, output: 5, cacheRead: 0, cacheWrite: 0 });
      throw new Error("Expected failure");
    },
  );
  const first = await history.start("slow", slow, "", "webhook");
  await ready.promise;
  const second = await history.start("fast", fast, "", "web");
  await second.completion;
  release.resolve();
  await first.completion;
  expect(history.get(first.id)?.usage.input).toBe(30);
  expect(history.get(second.id)?.usage.input).toBe(100);
  expect(history.get(second.id)?.error).toBe("Expected failure");
  expect(history.get(second.id)?.status).toBe("failed");
});

test("recovers a truncated journal as interrupted and saves the recovery", async () => {
  const history = await store();
  const quick = workflow(
    { name: "Quick", input: Type.String(), output: Type.String() },
    () => "done",
  );
  const run = await history.start("quick", quick, "", "web");
  await run.completion;
  const path = resolve(history.directory, `${run.id}.jsonl`);
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  await writeFile(path, `${lines.slice(0, -1).join("\n")}\n{"type":`);
  const recovered = new RunStore(history.directory, history.cwd);
  await recovered.init();
  expect(recovered.get(run.id)?.status).toBe("interrupted");
  expect(
    buildTimeline(recovered.get(run.id)!.events, "interrupted")[0]?.status,
  ).toBe("completed");
  const again = new RunStore(history.directory, history.cwd);
  await again.init();
  expect(again.get(run.id)).toEqual(recovered.get(run.id));
  expect(await readdir(history.directory)).toEqual([`${run.id}.jsonl`]);
});
