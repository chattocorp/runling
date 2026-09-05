import { fitWindow, type TimeWindow } from "./timeline-layout.ts";

/** Include the full run and any empty time the user has explored. */
export function overviewSpan(elapsed: number, view: TimeWindow): number {
  return Math.max(fitWindow(elapsed).span, view.start + view.span);
}

export function moveOverview(
  view: TimeWindow,
  total: number,
  time: number,
  offset = view.span / 2,
): TimeWindow {
  return {
    span: view.span,
    start: Math.max(0, Math.min(total - view.span, time - offset)),
  };
}
