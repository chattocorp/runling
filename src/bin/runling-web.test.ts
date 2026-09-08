import { expect, test } from "vitest";
import { createServeCommand } from "../runtime/cli.ts";

test("development server uses the same server options", () => {
  const command = createServeCommand().name("runling-web").exitOverride();
  command.parse(["--port", "4173", "--open"], { from: "user" });
  expect(command.opts()).toEqual({ config: "runling.config.ts", host: "localhost", port: 4173, open: true });
});
