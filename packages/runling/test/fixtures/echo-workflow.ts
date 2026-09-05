import { Type, workflow } from "../../src/index.ts";

export default workflow(
  {
    name: "Echo",
    input: Type.String(),
    output: Type.Object({
      summary: Type.String(),
      outputs: Type.Object({ id: Type.String() }),
    }),
  },
  function echo({ randomId }, input) {
    const id = randomId();
    if (!/^[a-z]+-[a-z]+-\d{4}$/.test(id)) {
      throw new Error("The runling runtime was not injected");
    }
    return {
      summary: input,
      outputs: { id },
    };
  },
);
