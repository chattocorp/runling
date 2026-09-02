import { describe, expect, test } from "bun:test";
import { displayPath, displayText } from "./paths.ts";

describe("displayPath", () => {
  const cwd = "/tmp/project";

  test("strips the cwd prefix", () => {
    expect(displayPath("/tmp/project/src/agent.ts", cwd)).toBe("src/agent.ts");
  });

  test("returns . for the cwd itself", () => {
    expect(displayPath("/tmp/project", cwd)).toBe(".");
  });

  test("leaves paths outside cwd untouched", () => {
    expect(displayPath("/tmp/other/file.ts", cwd)).toBe("/tmp/other/file.ts");
  });

  test("does not strip a mere prefix without a separator", () => {
    expect(displayPath("/tmp/project-x/file.ts", cwd)).toBe(
      "/tmp/project-x/file.ts",
    );
  });

  test("defaults to process.cwd()", () => {
    expect(displayPath(`${process.cwd()}/src/paths.ts`)).toBe("src/paths.ts");
  });
});

describe("displayText", () => {
  const cwd = "/tmp/project";

  test("removes embedded absolute cwd paths", () => {
    expect(displayText("bun test /tmp/project/src/agent.ts", cwd)).toBe(
      "bun test src/agent.ts",
    );
  });

  test("leaves text without cwd references untouched", () => {
    expect(displayText("bun test src/agent.ts", cwd)).toBe(
      "bun test src/agent.ts",
    );
  });

  test("handles multiple occurrences", () => {
    expect(
      displayText("cat /tmp/project/a.ts /tmp/project/b.ts", cwd),
    ).toBe("cat a.ts b.ts");
  });

  test("defaults to process.cwd()", () => {
    expect(displayText(`cat ${process.cwd()}/index.ts`)).toBe("cat index.ts");
  });
});
