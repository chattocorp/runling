import { workflow } from "../../src/index.ts";

export default workflow("Echo", ({ randomId }, { prompt }) => {
  const id = randomId();
  if (!/^[a-z]+-[a-z]+-\d{4}$/.test(id)) {
    throw new Error("The factory runtime was not injected");
  }
  return prompt;
});
