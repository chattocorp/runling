import { describe, expect, it } from "vitest";
import { oppositeTheme, resolveTheme } from "./theme.ts";

describe("resolveTheme", () => {
  it("uses a saved theme before the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("uses the system preference without a valid saved theme", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("unknown", false)).toBe("light");
  });
});

describe("oppositeTheme", () => {
  it("switches between light and dark", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });
});
