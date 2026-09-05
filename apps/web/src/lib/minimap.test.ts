import { expect, test } from "vitest";
import { overviewSpan, moveOverview } from "./minimap.ts";

test("vertical navigation preserves the grab position and clamps the last visible row", () => {
  const viewport = { start: 300, span: 450 };
  expect(moveOverview(viewport, 3000, 1200, 100).start).toBe(1100);
  expect(moveOverview(viewport, 3000, 4000, 100).start).toBe(2550);
  expect(moveOverview({ start: 0, span: 200 }, 200, 150).start).toBe(0);
});

test("overview includes the full run, empty runs, and panned empty space", () => {
  expect(overviewSpan(0, { start: 0, span: 100 })).toBe(100);
  expect(overviewSpan(1000, { start: 200, span: 100 })).toBe(2000);
  expect(overviewSpan(1000, { start: 5000, span: 100 })).toBe(5100);
});
test("click centers the view and clamps it to the overview", () => {
  const view = { start: 0, span: 200 };
  expect(moveOverview(view, 1000, 500)).toEqual({ start: 400, span: 200 });
  expect(moveOverview(view, 1000, -100).start).toBe(0);
  expect(moveOverview(view, 1000, 1500).start).toBe(800);
});
test("drag preserves the grabbed offset and zoom", () => {
  expect(moveOverview({ start: 100, span: 200 }, 1000, 450, 50)).toEqual({
    start: 400,
    span: 200,
  });
  expect(moveOverview({ start: 0, span: 1000 }, 1000, 800).start).toBe(0);
});
