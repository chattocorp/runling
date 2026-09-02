import { $ } from "bun";

function pi(prompt: string) {
  return $`pi -p ${prompt}`.text();
}

const prompt = "Write a funny joke!";
const result = await pi(prompt);

console.log(result);
