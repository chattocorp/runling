import Ajv2020 from "ajv/dist/2020.js";
import type { TSchema } from "typebox";

const validator = new Ajv2020({
  strict: false,
  validateFormats: false,
});

/** Validate an object schema against the JSON Schema 2020-12 meta-schema. */
export function isWorkflowSchema(value: unknown): value is TSchema {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    return validator.validateSchema(value) === true;
  } catch {
    return false;
  }
}
