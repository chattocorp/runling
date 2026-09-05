import { expect, test } from "bun:test";
import { renderMarkdown } from "./markdown.ts";

test("renders Markdown as styled terminal text", () => {
  const rendered = renderMarkdown(
    "## Findings\n\n- Read **carefully**\n- Run `bun test`",
    80,
  );
  const plain = Bun.stripANSI(rendered);

  expect(rendered).toContain("\x1b[");
  expect(plain).toContain("Findings");
  expect(plain).toContain("Read carefully");
  expect(plain).toContain("Run bun test");
  expect(plain).not.toContain("##");
  expect(plain).not.toContain("**");
});

test.each([12, 19, 20, 24])(
  "wraps Markdown to a %i-column terminal",
  (width) => {
    const rendered = renderMarkdown(
      "A long sentence made from words that fit within the width.",
      width,
    );

    expect(rendered.split("\n").length).toBeGreaterThan(1);
    expect(
      rendered.split("\n").every((line) => Bun.stringWidth(line) <= width),
    ).toBe(true);
  },
);

test("uses a fallback width when the terminal width is invalid", () => {
  expect(() => renderMarkdown("Still renders", 0)).not.toThrow();
});
