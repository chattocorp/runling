import { randomId, Type, workflow } from "../../src/index.ts";

export default workflow(
  {
    name: "Echo",
    input: Type.String(),
    output: Type.Object({
      summary: Type.String(),
      outputs: Type.Object({ id: Type.String() }),
    }),
  },
  function echo(f, input) {
    const id = randomId();
    if (typeof f.step !== "function") {
      throw new Error("The runling runtime was not injected");
    }
    return {
      summary: input,
      outputs: { id },
    };
  },
);
