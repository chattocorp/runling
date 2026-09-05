import type { Static, TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { Factory } from "./runtime.ts";
import { isWorkflowSchema } from "./schema.ts";

export interface WorkflowDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  name: string;
  input: InputSchema;
  output: OutputSchema;
}

export type Workflow<
  InputSchema extends TSchema = TSchema,
  OutputSchema extends TSchema = TSchema,
> = ((
  f: Factory,
  input: Static<InputSchema>,
) => Promise<Static<OutputSchema>> | Static<OutputSchema>) &
  Readonly<WorkflowDefinition<InputSchema, OutputSchema>>;

const validationMessage = (
  workflowName: string,
  boundary: "input" | "output",
  schema: TSchema,
  value: unknown,
): string => {
  const details = Errors(schema, value)
    .slice(0, 3)
    .map(({ instancePath, message }) =>
      `${instancePath === "" ? "/" : instancePath}: ${message}`,
    )
    .join("; ");

  return `Workflow ${JSON.stringify(workflowName)} ${boundary} is invalid${details === "" ? "" : `: ${details}`}`;
};

/** Define a named workflow with validated JSON Schema input and output. */
export function workflow<
  const InputSchema extends TSchema,
  const OutputSchema extends TSchema,
>(
  definition: WorkflowDefinition<InputSchema, OutputSchema>,
  run: (
    f: Factory,
    input: Static<InputSchema>,
  ) => Promise<Static<OutputSchema>> | Static<OutputSchema>,
): Workflow<InputSchema, OutputSchema> {
  for (const boundary of ["input", "output"] as const) {
    if (!isWorkflowSchema(definition[boundary])) {
      throw new TypeError(
        `Workflow ${JSON.stringify(definition.name)} ${boundary} schema is invalid`,
      );
    }
  }
  const defined = (async (f: Factory, input: Static<InputSchema>) => {
    if (!Check(definition.input, input)) {
      throw new TypeError(
        validationMessage(definition.name, "input", definition.input, input),
      );
    }

    return f.step(definition.name, async () => {
      const output = await run(f, input);
      if (!Check(definition.output, output)) {
        throw new TypeError(
          validationMessage(
            definition.name,
            "output",
            definition.output,
            output,
          ),
        );
      }
      return output;
    });
  }) as Workflow<InputSchema, OutputSchema>;

  Object.defineProperties(defined, {
    name: { value: definition.name },
    input: { value: definition.input, enumerable: true },
    output: { value: definition.output, enumerable: true },
  });

  return defined;
}

export const isWorkflow = (value: unknown): value is Workflow =>
  typeof value === "function" &&
  typeof (value as Partial<Workflow>).name === "string" &&
  isWorkflowSchema((value as Partial<Workflow>).input) &&
  isWorkflowSchema((value as Partial<Workflow>).output);
