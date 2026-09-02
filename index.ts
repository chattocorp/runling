import { $ } from "bun";

function pi(prompt: string) {
  return $`pi -p ${prompt}`.text();
}

const [prompt] = Bun.argv.slice(2);

if (prompt === undefined) {
  console.error("Usage: bun index.ts <prompt>");
  process.exit(1);
}

const result = await pi(prompt);

console.log(result);
