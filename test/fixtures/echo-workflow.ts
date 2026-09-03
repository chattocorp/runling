import type { Factory } from "../../src/index.ts";

export default function echo({ prompt, randomId }: Factory) {
  const id = randomId();
  if (!/^[a-z]+-[a-z]+-\d{4}$/.test(id)) {
    throw new Error("The factory runtime was not injected");
  }
  return {
    summary: prompt,
    outputs: { id },
  };
}
