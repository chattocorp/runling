import type { Static, TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { isWorkflowSchema } from "./schema.ts";
import { step } from "./step.ts";

export interface TaskDefinition<InputSchema extends TSchema, OutputSchema extends TSchema> {
  name: string;
  input: InputSchema;
  output: OutputSchema;
}

export type TaskFunction = (...args: any[]) => any;
export type Task<
  InputSchema extends TSchema = TSchema,
  OutputSchema extends TSchema = TSchema,
  Run extends TaskFunction = (input: Static<InputSchema>) => Static<OutputSchema> | Promise<Static<OutputSchema>>,
> = ((input: Static<InputSchema>) => ReturnType<Run>) & Readonly<TaskDefinition<InputSchema, OutputSchema>>;

const taskMarker = Symbol.for("runling.task");

const validationMessage = (
  name: string,
  boundary: "input" | "output",
  schema: TSchema,
  value: unknown,
): string => {
  const details = Errors(schema, value).slice(0, 3).map(({ instancePath, message }) =>
    `${instancePath === "" ? "/" : instancePath}: ${message}`,
  ).join("; ");
  return `Task ${JSON.stringify(name)} ${boundary} is invalid${details === "" ? "" : `: ${details}`}`;
};

/** Track an ordinary function without changing its arguments or return behavior. */
export function task<Run extends TaskFunction>(run: Run): Run;
/** Track a function with validated JSON Schema input and output. */
export function task<
  const InputSchema extends TSchema,
  const OutputSchema extends TSchema,
  const Run extends (input: Static<InputSchema>) => unknown,
>(
  definition: TaskDefinition<InputSchema, OutputSchema>,
  run: Run,
): Task<InputSchema, OutputSchema, Run>;
export function task(
  definitionOrRun: TaskDefinition<TSchema, TSchema> | TaskFunction,
  implementation?: TaskFunction,
): TaskFunction {
  const definition = typeof definitionOrRun === "function" ? undefined : definitionOrRun;
  const run = typeof definitionOrRun === "function" ? definitionOrRun : implementation!;
  const name = definition?.name ?? (run.name || "Task");
  if (definition) {
    for (const boundary of ["input", "output"] as const) {
      if (!isWorkflowSchema(definition[boundary])) {
        throw new TypeError(`Task ${JSON.stringify(name)} ${boundary} schema is invalid`);
      }
    }
  }
  const validateOutput = (output: unknown) => {
    if (definition && !Check(definition.output, output)) {
      throw new TypeError(validationMessage(name, "output", definition.output, output));
    }
    return output;
  };
  const defined = function (this: unknown, ...args: unknown[]) {
    if (definition && !Check(definition.input, args[0])) {
      throw new TypeError(validationMessage(name, "input", definition.input, args[0]));
    }
    return step(name, () => {
      const output = Reflect.apply(run, this, args);
      if (!definition) return output;
      if (output != null && typeof output.then === "function") {
        return Promise.resolve(output).then(validateOutput);
      }
      return validateOutput(output);
    });
  };
  Object.defineProperties(defined, {
    name: { value: name },
    [taskMarker]: { value: true },
    ...(definition ? {
      input: { value: definition.input, enumerable: true },
      output: { value: definition.output, enumerable: true },
    } : {}),
  });
  return defined;
}

export const isSchemaTask = (value: unknown): value is Task =>
  typeof value === "function" &&
  typeof value.name === "string" &&
  isWorkflowSchema((value as Partial<Task>).input) &&
  isWorkflowSchema((value as Partial<Task>).output);

export const isTask = (value: unknown): value is TaskFunction =>
  typeof value === "function" &&
  ((value as unknown as Record<symbol, unknown>)[taskMarker] === true || isSchemaTask(value));
