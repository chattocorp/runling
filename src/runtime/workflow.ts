import type { Static, TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { Runling } from "./runtime.ts";
import { isWorkflowSchema } from "./schema.ts";

export interface WorkflowDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  name: string;
  input: InputSchema;
  output: OutputSchema;
}

export type WorkflowFunction = (
  f: Runling,
  input: any,
) => unknown | Promise<unknown>;

export type Workflow<
  InputSchema extends TSchema = TSchema,
  OutputSchema extends TSchema = TSchema,
  Run extends WorkflowFunction = (
    f: Runling,
    input: Static<InputSchema>,
  ) => Static<OutputSchema> | Promise<Static<OutputSchema>>,
> = ((
  f: Runling,
  input: Static<InputSchema>,
) => Promise<Awaited<ReturnType<Run>>>) &
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

/** Wrap a named task with validated JSON Schema input and output. */
export function task<
  const InputSchema extends TSchema,
  const OutputSchema extends TSchema,
  const Run extends WorkflowFunction,
>(
  definition: WorkflowDefinition<InputSchema, OutputSchema>,
  run: Run & ((f: Runling, input: Static<InputSchema>) => unknown),
): Workflow<InputSchema, OutputSchema, Run> {
  for (const boundary of ["input", "output"] as const) {
    if (!isWorkflowSchema(definition[boundary])) {
      throw new TypeError(
        `Workflow ${JSON.stringify(definition.name)} ${boundary} schema is invalid`,
      );
    }
  }
  const defined = (async (f: Runling, input: Static<InputSchema>) => {
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
  }) as Workflow<InputSchema, OutputSchema, Run>;

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
