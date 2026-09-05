import { describe, expect, test } from "vitest";
import { parseFactoryWebArguments } from "./factory-web.ts";

describe("factory-web executable", () => {
  test("uses the local development server defaults", () => {
    expect(parseFactoryWebArguments([])).toEqual({
      config: "factory.web.ts",
      help: false,
      host: "localhost",
      open: false,
      port: 5173,
    });
  });

  test("accepts server options", () => {
    expect(
      parseFactoryWebArguments([
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
    expect(() => parseFactoryWebArguments(["--port", "nope"])).toThrow(
      "Port must be an integer from 1 through 65535",
    );
  });
});
