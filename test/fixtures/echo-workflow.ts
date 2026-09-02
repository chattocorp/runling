import type { FactoryWorkflow } from "../../src/index.ts";

const echoWorkflow: FactoryWorkflow = ({ randomId }, { prompt }) => {
  const id = randomId();
  if (!/^[a-z]+-[a-z]+-\d{4}$/.test(id)) {
    throw new Error("The factory runtime was not injected");
  }
  return prompt;
};

export default echoWorkflow;
