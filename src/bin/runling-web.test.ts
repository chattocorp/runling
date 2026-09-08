import { describe, expect, test } from "vitest";
import { parseRunlingWebArguments } from "./runling-web.ts";

describe("runling-web executable", () => {
  test("uses the local development server defaults", () => {
    expect(parseRunlingWebArguments([])).toEqual({
      config: "runling.config.ts",
      help: false,
      host: "localhost",
      open: false,
      port: 5173,
    });
  });

  test("accepts server options", () => {
    expect(
      parseRunlingWebArguments([
        "--host",
        "127.0.0.1",
        "--port",
        "4173",
        "--open",
        "--config",
        "custom.web.ts",
      ]),
    ).toEqual({
      config: "custom.web.ts",
      help: false,
      host: "127.0.0.1",
      open: true,
      port: 4173,
    });
  });

  test("rejects an invalid port", () => {
    expect(() => parseRunlingWebArguments(["--port", "nope"])).toThrow(
      "Port must be an integer from 1 through 65535",
    );
  });
});
