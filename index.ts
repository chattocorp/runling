import { $ } from "bun";
import { runAgent } from "./src/agent.ts";
import { workingTreeHash } from "./src/git.ts";
import { log } from "./src/log.ts";

const [prompt] = Bun.argv.slice(2);

if (prompt === undefined) {
  log.error("Usage: bun index.ts <prompt>");
  process.exit(1);
}

const statusBefore = await workingTreeHash();
const report = await runAgent(prompt).catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

if (report === undefined) {
  log.error("Agent finished without a valid outcome report");
  process.exit(2);
}

if (report.outcome !== "completed") {
  log.error(report.summary);
  process.exit(1);
}

const statusAfter = await workingTreeHash();

if (statusBefore !== statusAfter) {
  log.info("Running tests");
  const tests = await $`bun test`.nothrow();

  if (tests.exitCode !== 0) {
    log.error("Tests failed");
    process.exit(3);
  }
}

log.success(report.summary);
