<script lang="ts">
  import type { Activity } from "$lib/timeline.ts";
  import { zoomWindow, type TimeWindow } from "$lib/timeline-layout.ts";
  import { overviewSpan, moveOverview } from "$lib/minimap.ts";
  import { duration } from "$lib/runs.ts";
  import { middleDrag } from "$lib/middle-drag.ts";
  let {
    rows,
    view,
    vertical,
    elapsed,
    selected,
    onchange,
    onfit,
  }: {
    rows: { node: Activity; top: number; height: number }[];
    view: TimeWindow;
    vertical: { start: number; span: number; total: number };
    elapsed: number;
    selected: string;
    onchange: (view: TimeWindow, top: number) => void;
    onfit: () => void;
  } = $props();
  let collapsed = $state(false);
  let middleDragging = $state(false);
  function attachMiddleDrag(element: HTMLElement) {
    return middleDrag(
      element,
      () => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const initial = { ...view };
        const initialTop = top;
        const horizontalTotal = total;
        const verticalTotal = axis.total;
        const height = visible;
        middleDragging = true;
        return (dx, dy) =>
          onchange(
            moveOverview(
              initial,
              horizontalTotal,
              initial.start + (dx / rect.width) * horizontalTotal,
              0,
            ),
            moveOverview(
              { start: initialTop, span: height },
              verticalTotal,
              initialTop + (dy / rect.height) * verticalTotal,
              0,
            ).start,
          );
      },
      () => {
        middleDragging = false;
      },
    );
  }
  let gesture = $state<{
    id: number;
    rect: DOMRect;
    total: number;
    axis: typeof vertical;
    view: TimeWindow;
    x: number;
    y: number;
  }>();
  let total = $derived(gesture?.total ?? overviewSpan(elapsed, view));
  let axis = $derived(gesture?.axis ?? vertical);
  let visible = $derived(Math.min(axis.span, axis.total));
  let top = $derived(
    Math.min(vertical.start, Math.max(0, axis.total - visible)),
  );

  function down(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button === 1) return;
    if ((event.button !== 0 && event.button !== 1) || gesture) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * total;
    const y = ((event.clientY - rect.top) / rect.height) * axis.total;
    const inside =
      x >= view.start &&
      x <= view.start + view.span &&
      y >= top &&
      y <= top + visible;
    gesture = {
      id: event.pointerId,
      rect,
      total,
      axis: { ...axis },
      view: { ...view },
      x: inside || event.button === 1 ? x - view.start : view.span / 2,
      y: inside || event.button === 1 ? y - top : visible / 2,
    };
    element.setPointerCapture(event.pointerId);
    element.focus();
    move(event);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    const x = ((event.clientX - g.rect.left) / g.rect.width) * g.total;
    const y = ((event.clientY - g.rect.top) / g.rect.height) * g.axis.total;
    onchange(
      moveOverview(g.view, g.total, x, g.x),
      moveOverview(
        { start: g.axis.start, span: Math.min(g.axis.span, g.axis.total) },
        g.axis.total,
        y,
        g.y,
      ).start,
    );
  }
  function end(event: PointerEvent) {
    if (gesture?.id !== event.pointerId) return;
    gesture = undefined;
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId))
      element.releasePointerCapture(event.pointerId);
  }
  function preventMiddleDefault(event: MouseEvent) {
    if (event.button === 1) event.preventDefault();
  }
  function key(event: KeyboardEvent) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      onchange(
        moveOverview(
          view,
          total,
          view.start + (event.key === "ArrowLeft" ? -1 : 1) * view.span * 0.15,
          0,
        ),
        top,
      );
    else if (event.key === "ArrowUp" || event.key === "ArrowDown")
      onchange(
        view,
        moveOverview(
          { start: top, span: visible },
          axis.total,
          top + (event.key === "ArrowUp" ? -1 : 1) * visible * 0.2,
          0,
        ).start,
      );
    else if (event.key === "Home") onchange({ ...view, start: 0 }, 0);
    else if (event.key === "End")
      onchange(
        { ...view, start: Math.max(0, total - view.span) },
        axis.total - visible,
      );
    else if (event.key === "+" || event.key === "=")
      onchange(zoomWindow(view, 0.7), top);
    else if (event.key === "-") onchange(zoomWindow(view, 1 / 0.7), top);
    else if (event.key.toLowerCase() === "f") onfit();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div class="minimap" class:collapsed>
  <div class="caption">
    <span>Overview</span><button
      onclick={() => (collapsed = !collapsed)}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show minimap" : "Hide minimap"}
      >{collapsed ? "+" : "−"}</button
    >
  </div>
  {#if !collapsed}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Two-dimensional overview supports pointer and keyboard navigation.) -->
    <div
      class="map"
      class:dragging={!!gesture || middleDragging}
      {@attach attachMiddleDrag}
      role="region"
      tabindex="0"
      aria-label={`Timeline minimap, ${duration(view.start)} to ${duration(view.start + view.span)}. Arrow keys pan in both directions; plus and minus zoom; F fits time.`}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={end}
      onpointercancel={end}
      onlostpointercapture={end}
      onmousedown={preventMiddleDefault}
      onauxclick={preventMiddleDefault}
      onkeydown={key}
    >
      <svg
        viewBox={`0 0 1000 ${axis.total}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each rows as { node, top, height } (node.id)}
          <rect
            x={(node.startedAt / total) * 1000}
            y={top + height * 0.2}
            width={Math.max(
              1,
              ((node.durationMs ?? Math.max(0, elapsed - node.startedAt)) /
                total) *
                1000,
            )}
            height={height * 0.6}
            data-kind={node.kind}
            class:failed={node.status === "failed" || node.status === "blocked"}
            class:selected={node.id === selected}
          />
        {/each}
      </svg>
      <span
        class="window"
        style:left={`${(view.start / total) * 100}%`}
        style:width={`${(view.span / total) * 100}%`}
        style:top={`${(top / axis.total) * 100}%`}
        style:height={`${(visible / axis.total) * 100}%`}
      ></span>
      <span class="playhead" style:left={`${(elapsed / total) * 100}%`}></span>
    </div>
    <div class="caption bounds">
      <span>0</span><span>{duration(total)}</span>
    </div>
  {/if}
</div>

<style>
  .minimap {
    position: absolute;
    bottom: 12px;
    right: 24px;
    z-index: 5;
    width: 230px;
    max-width: calc(100% - 36px);
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #f8faffee;
    box-shadow: 0 3px 14px #24324b26;
  }
  .minimap.collapsed {
    width: 105px;
  }
  .caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--muted);
    font-size: 10px;
    margin-bottom: 6px;
  }
  .caption button {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 6px;
    font-size: 14px;
  }
  .bounds {
    margin: 5px 0 0;
    font-variant-numeric: tabular-nums;
  }
  .map {
    height: 130px;
    position: relative;
    background: white;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  .map.dragging {
    cursor: grabbing;
  }
  .map:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 3px;
  }
  svg {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  rect {
    fill: #547dbc;
  }
  rect[data-kind="agent"] {
    fill: #8866b3;
  }
  rect[data-kind="command"] {
    fill: #43998a;
  }
  rect[data-kind="input"] {
    fill: #bf903e;
  }
  rect.failed {
    fill: #c4525c;
  }
  rect.selected {
    stroke: #24324b;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .window,
  .playhead {
    position: absolute;
    pointer-events: none;
  }
  .window {
    border: 2px solid #547dbc;
    background: #547dbc0d;
    min-width: 2px;
    min-height: 2px;
    box-sizing: border-box;
    box-shadow: 0 0 0 1000px #dce4f288;
  }
  .playhead {
    top: 0;
    bottom: 0;
    width: 1px;
    background: #c4525c;
  }
</style>
