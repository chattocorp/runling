import { $ } from "bun";
import { parseArgs } from "node:util";
import { runAgent } from "./src/agent.ts";
import { workingTreeHash } from "./src/git.ts";
import { log } from "./src/log.ts";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    verbose: {
      type: "boolean",
      short: "v",
      default: false,
    },
  },
  allowPositionals: true,
  strict: true,
});

const [prompt] = positionals;
const agentModel = "openrouter/z-ai/glm-5.3-flash";
const agentInstructions = ["Write tests for new or changed features."];

if (prompt === undefined) {
  log.error("Usage: bun index.ts [-v|--verbose] <prompt>");
  process.exit(1);
}

const statusBefore = await workingTreeHash();
const report = await runAgent(prompt, {
  model: agentModel,
  instructions: agentInstructions,
}).catch((error: unknown) => {
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
  const tests = values.verbose
    ? await $`bun test`.nothrow()
    : await $`bun test`.quiet().nothrow();

  if (tests.exitCode !== 0) {
    if (!values.verbose) {
      process.stdout.write(tests.stdout);
      process.stderr.write(tests.stderr);
    }

    log.error("Tests failed");
    process.exit(3);
  }
}

log.success(report.summary);
