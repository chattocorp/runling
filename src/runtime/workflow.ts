import type { Static, TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { Runling } from "./runtime.ts";
import { isWorkflowSchema } from "./schema.ts";

export interface TaskDefinition<
  InputSchema extends TSchema,
  OutputSchema extends TSchema,
> {
  name: string;
  input: InputSchema;
  output: OutputSchema;
}

export type TaskFunction = (
  f: Runling,
  input: any,
) => unknown | Promise<unknown>;

export type Task<
  InputSchema extends TSchema = TSchema,
  OutputSchema extends TSchema = TSchema,
  Run extends TaskFunction = (
    f: Runling,
    input: Static<InputSchema>,
  ) => Static<OutputSchema> | Promise<Static<OutputSchema>>,
> = ((
  f: Runling,
  input: Static<InputSchema>,
) => Promise<Awaited<ReturnType<Run>>>) &
  Readonly<TaskDefinition<InputSchema, OutputSchema>>;

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
  const Run extends TaskFunction,
>(
  definition: TaskDefinition<InputSchema, OutputSchema>,
  run: Run & ((f: Runling, input: Static<InputSchema>) => unknown),
): Task<InputSchema, OutputSchema, Run> {
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
  }) as Task<InputSchema, OutputSchema, Run>;

  Object.defineProperties(defined, {
    name: { value: definition.name },
    input: { value: definition.input, enumerable: true },
    output: { value: definition.output, enumerable: true },
  });

  return defined;
}

export const isTask = (value: unknown): value is Task =>
  typeof value === "function" &&
  typeof (value as Partial<Task>).name === "string" &&
  isWorkflowSchema((value as Partial<Task>).input) &&
  isWorkflowSchema((value as Partial<Task>).output);
