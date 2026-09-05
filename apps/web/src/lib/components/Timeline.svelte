<script lang="ts">
  import { onMount, tick } from "svelte";
  import { duration } from "$lib/runs.ts";
  import { findActivity, type Activity } from "$lib/timeline.ts";
  import {
    barPosition,
    fitWindow,
    flattenActivities,
    panWindow,
    timelineTicks,
    tickLabel,
    zoomWindow,
    type TimeWindow,
  } from "$lib/timeline-layout.ts";

  let {
    nodes,
    selected,
    onselect,
    elapsed,
    running,
  }: {
    nodes: Activity[];
    selected: string;
    onselect: (id: string) => void;
    elapsed: number;
    running: boolean;
  } = $props();
  let board: HTMLDivElement;
  let ruler: HTMLDivElement;
  let panel: HTMLElement;
  let expandButton: HTMLButtonElement;
  let manual = $state<TimeWindow | null>(null);
  let collapsed = $state<Set<string>>(new Set());
  let plotWidth = $state(500);
  let expanded = $state(false);
  let dragging = $state(false);
  let view = $derived(manual ?? fitWindow(elapsed));
  let rows = $derived(flattenActivities(nodes, collapsed));
  let ticks = $derived(timelineTicks(view, plotWidth));
  let cursor = $derived(((elapsed - view.start) / view.span) * 100);
  let zoom = $derived(fitWindow(elapsed).span / view.span);
  let inspected = $derived(findActivity(nodes, selected));

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  }
  function fit() {
    manual = null;
  }
  async function toggleExpanded() {
    expanded = !expanded;
    await tick();
    if (expanded) board.focus();
    else expandButton.focus();
  }
  function globalKey(event: KeyboardEvent) {
    if (!expanded) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void toggleExpanded();
    }
    if (event.key === "Tab") {
      const controls = [
        ...panel.querySelectorAll<HTMLElement>('button, [tabindex="0"]'),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  function zoomBy(factor: number, anchor = 0.5) {
    manual = zoomWindow(view, factor, anchor);
  }
  function keyboard(event: KeyboardEvent) {
    if (event.target !== board) return;
    if (event.key === "+" || event.key === "=") zoomBy(0.7);
    else if (event.key === "-") zoomBy(1 / 0.7);
    else if (event.key === "ArrowLeft")
      manual = panWindow(view, -view.span * 0.15);
    else if (event.key === "ArrowRight")
      manual = panWindow(view, view.span * 0.15);
    else if (event.key === "Home" || event.key.toLowerCase() === "f") fit();
    else return;
    event.preventDefault();
  }

  onMount(() => {
    const observer = new ResizeObserver(() => {
      plotWidth = Math.max(1, ruler.clientWidth);
    });
    observer.observe(ruler);
    const wheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".plot"))
        return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? plotWidth : 1;
      if (
        event.shiftKey ||
        (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey)
      ) {
        manual = panWindow(
          view,
          (((event.deltaX || event.deltaY) * unit) / plotWidth) * view.span,
        );
      } else {
        const anchor =
          (event.clientX - ruler.getBoundingClientRect().left) / plotWidth;
        zoomBy(
          Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.004))),
          anchor,
        );
      }
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: {
      view: TimeWindow;
      x: number;
      y: number;
      distance: number;
      scroll: number;
    } | null = null;
    let suppressUntil = 0;
    const center = () => {
      const values = [...pointers.values()];
      const first = values[0]!;
      const second = values[1];
      return {
        x: second ? (first.x + second.x) / 2 : first.x,
        y: second ? (first.y + second.y) / 2 : first.y,
        distance: second
          ? Math.hypot(first.x - second.x, first.y - second.y)
          : 0,
      };
    };
    const begin = () => {
      gesture = { ...center(), view: { ...view }, scroll: board.scrollTop };
    };
    const down = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        !event.target.closest(".plot")
      )
        return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      begin();
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = center();
      const dx = current.x - gesture.x;
      const dy = current.y - gesture.y;
      if (!dragging && pointers.size === 1 && Math.hypot(dx, dy) < 4) return;
      dragging = true;
      board.setPointerCapture(event.pointerId);
      const anchor =
        (gesture.x - ruler.getBoundingClientRect().left) / plotWidth;
      const zoomed =
        gesture.distance > 0 && current.distance > 0
          ? zoomWindow(
              gesture.view,
              gesture.distance / current.distance,
              anchor,
            )
          : gesture.view;
      manual = panWindow(zoomed, (-dx / plotWidth) * zoomed.span);
      board.scrollTop = gesture.scroll - dy;
    };
    const up = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (dragging) suppressUntil = performance.now() + 200;
      if (pointers.size) begin();
      else {
        gesture = null;
        dragging = false;
      }
    };
    const click = (event: MouseEvent) => {
      if (event.detail && performance.now() < suppressUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    board.addEventListener("wheel", wheel, { passive: false });
    board.addEventListener("pointerdown", down);
    board.addEventListener("click", click, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      observer.disconnect();
      board.removeEventListener("wheel", wheel);
      board.removeEventListener("pointerdown", down);
      board.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });
</script>

<svelte:window onkeydown={globalKey} />

<section
  class="timeline"
  class:expanded
  aria-label="Execution timeline"
  bind:this={panel}
>
  <div class="toolbar">
    <div class="mode">
      <span class:live={running} class="mode-dot"></span>{manual
        ? "Explore"
        : running
          ? "Live fit"
          : "Full timeline"}<span class="zoom-value"
        >{zoom.toFixed(zoom < 10 ? 1 : 0)}×</span
      >
    </div>
    <div class="controls">
      <button
        onclick={() => zoomBy(1 / 0.7)}
        aria-label="Zoom out"
        title="Zoom out (−)">−</button
      >
      <button
        onclick={() => zoomBy(0.7)}
        aria-label="Zoom in"
        title="Zoom in (+)">+</button
      >
      <button
        class="fit"
        class:active={!manual}
        onclick={fit}
        title="Fit full timeline (F)">Fit timeline</button
      >
      <button
        bind:this={expandButton}
        onclick={toggleExpanded}
        aria-label={expanded ? "Exit expanded timeline" : "Expand timeline"}
        title={expanded ? "Exit expanded view (Escape)" : "Expand timeline"}
        >{expanded ? "↙" : "↗"}</button
      >
    </div>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The scrollable chart is focusable for its documented pan and zoom keyboard controls.) -->
  <div
    class="board"
    class:dragging
    bind:this={board}
    tabindex="0"
    role="region"
    aria-roledescription="Interactive timeline"
    aria-label="Timeline chart. Drag to pan, scroll to zoom. Arrow keys pan, plus and minus zoom, F fits the timeline."
    onkeydown={keyboard}
  >
    <div class="grid" style:--row-count={rows.length}>
      <div class="label-heading">Activity <span>{rows.length}</span></div>
      <div class="ruler plot" bind:this={ruler}>
        {#each ticks as tick (tick)}
          <span
            class="tick"
            style:left={`${((tick - view.start) / view.span) * 100}%`}
            >{tickLabel(
              tick,
              ticks.length > 1 ? ticks[1]! - ticks[0]! : view.span / 5,
            )}</span
          >
        {/each}
        {#if cursor >= 0 && cursor <= 100}
          <span
            class="cursor-label"
            class:live={running}
            style:left={`${cursor}%`}>{running ? "Now" : "End"}</span
          >
        {/if}
      </div>
      {#each rows as { node, depth } (node.id)}
        {@const end =
          node.startedAt +
          (node.durationMs ?? Math.max(0, elapsed - node.startedAt))}
        {@const bar = barPosition(node.startedAt, end, view)}
        <div
          class="label"
          class:chosen={selected === node.id}
          style:padding-left={`${8 + Math.min(depth, 6) * 13}px`}
        >
          {#if node.children.length}
            <button
              class="toggle"
              aria-label={`${collapsed.has(node.id) ? "Expand" : "Collapse"} ${node.label}`}
              aria-expanded={!collapsed.has(node.id)}
              onclick={() => toggle(node.id)}
              >{collapsed.has(node.id) ? "▸" : "▾"}</button
            >
          {:else}<span class="leaf" aria-hidden="true"
              >{node.kind === "agent"
                ? "◈"
                : node.kind === "command"
                  ? "›_"
                  : "◇"}</span
            >{/if}
          <button
            class="label-select"
            onclick={() => onselect(node.id)}
            aria-pressed={selected === node.id}
            title={`${node.label} (${node.kind}, ${node.status})`}
            ><strong>{node.label}</strong><small>{node.kind}</small></button
          >
        </div>
        <div class="lane plot" class:chosen={selected === node.id}>
          {#each ticks as tick (tick)}<span
              class="gridline"
              style:left={`${((tick - view.start) / view.span) * 100}%`}
              aria-hidden="true"
            ></span>{/each}
          {#if cursor >= 0 && cursor <= 100}<span
              class="playhead"
              class:live={running}
              style:left={`${cursor}%`}
              aria-hidden="true"
            ></span>{/if}
          {#if bar}
            <button
              class="bar"
              class:running={node.status === "running"}
              class:failed={node.status === "failed" ||
                node.status === "blocked"}
              class:interrupted={node.status === "interrupted"}
              class:selected={selected === node.id}
              class:clipped-start={bar.clippedStart}
              class:clipped-end={bar.clippedEnd}
              data-kind={node.kind}
              style:left={`${bar.left}%`}
              style:width={`max(6px, ${bar.width}%)`}
              aria-label={`${node.label}, ${node.status}, starts at ${duration(node.startedAt)}, duration ${duration(end - node.startedAt)}`}
              aria-pressed={selected === node.id}
              onclick={() => onselect(node.id)}
              title={`${node.label}\n${node.status} · ${duration(end - node.startedAt)}\nStart: ${duration(node.startedAt)}`}
            >
              {#if bar.clippedStart}
                <span class="continuation start" aria-hidden="true">‹‹</span>
              {/if}
              <span class="bar-label">{bar.clippedStart ? "" : node.label}</span
              >
              {#if !bar.clippedEnd}
                <span class="bar-duration"
                  >{duration(end - node.startedAt)}</span
                >
              {:else}
                <span class="continuation end" aria-hidden="true">››</span>
              {/if}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
  {#if expanded && inspected}
    <div class="expanded-detail">
      <strong>{inspected.label}</strong><small>{inspected.status}</small>
      <pre>{inspected.logs.length
          ? inspected.logs.join("\n\n")
          : "No logs for this activity."}</pre>
    </div>
  {/if}
  <footer>
    <span>Scroll to zoom · Drag to pan · Shift+scroll to pan</span><span
      class="range"
      >{duration(view.start)} — {duration(view.start + view.span)}</span
    >
  </footer>
</section>

<style>
  .timeline {
    border: 1px solid var(--line);
    border-radius: 9px;
    background: white;
    overflow: hidden;
  }
  .timeline.expanded {
    position: fixed;
    inset: 20px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 0 0 30px #1e304e65,
      0 20px 100px #1e304e45;
  }
  .toolbar {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: #f8faff;
  }
  .mode {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .mode-dot {
    width: 6px;
    height: 6px;
    background: #8f9eb4;
    border-radius: 50%;
  }
  .mode-dot.live {
    background: var(--blue);
  }
  .zoom-value {
    color: #8290a5;
    padding-left: 5px;
    font-variant-numeric: tabular-nums;
  }
  .controls {
    display: flex;
    gap: 5px;
  }
  .controls button {
    border: 1px solid var(--line);
    border-radius: 4px;
    background: white;
    color: var(--ink);
    padding: 3px 8px;
    cursor: pointer;
    height: 28px;
    min-width: 28px;
    font-size: 16px;
  }
  .controls .fit {
    font-size: 11px;
    padding: 4px 9px;
  }
  .controls .active {
    background: #eaf0ff;
    color: var(--blue);
    border-color: #aec2ef;
  }
  .board {
    max-height: 480px;
    overflow-y: auto;
    overflow-x: hidden;
    outline-offset: -3px;
    scrollbar-gutter: stable;
  }
  .expanded .board {
    max-height: none;
    flex: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: clamp(125px, 29%, 235px) minmax(0, 1fr);
    grid-template-rows: 35px repeat(var(--row-count), 50px);
    min-width: 0;
  }
  .label-heading,
  .ruler {
    position: sticky;
    top: 0;
    z-index: 3;
    background: #f3f6fb;
    border-bottom: 1px solid var(--line);
  }
  .label-heading {
    font-size: 11px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-right: 1px solid var(--line);
  }
  .label-heading span {
    font-size: 10px;
    color: #8491a5;
  }
  .ruler {
    overflow: hidden;
  }
  .cursor-label {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    background: #8093b2;
    color: white;
    font-size: 9px;
    padding: 2px 5px;
    border-radius: 3px 3px 0 0;
    pointer-events: none;
  }
  .cursor-label.live {
    background: #c45955;
  }
  .expanded-detail {
    padding: 14px 20px;
    border-top: 1px solid var(--line);
    flex-shrink: 0;
  }
  .expanded-detail strong {
    font-size: 12px;
  }
  .expanded-detail small {
    margin-left: 12px;
    color: var(--muted);
    font-size: 11px;
  }
  .expanded-detail pre {
    max-height: 130px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin-bottom: 0;
  }
  .tick {
    position: absolute;
    top: 0;
    height: 100%;
    padding: 10px 0 0 6px;
    border-left: 1px solid #d3ddec;
    white-space: nowrap;
    color: var(--muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .label {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #e9edf5;
    border-right: 1px solid var(--line);
    background: #fafbfe;
    padding-right: 6px;
    min-width: 0;
  }
  .label.chosen {
    background: #eaf0fc;
  }
  .toggle,
  .leaf {
    flex-shrink: 0;
    width: 20px;
    display: grid;
    place-items: center;
    font-size: 13px;
    color: #7787a0;
  }
  .toggle {
    background: transparent;
    padding: 7px 0;
    border: 0;
    cursor: pointer;
  }
  .label-select {
    display: grid;
    gap: 3px;
    min-width: 0;
    flex: 1;
    background: none;
    border: 0;
    padding: 7px 3px;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }
  .label-select strong {
    font-size: 11px;
    font-weight: 550;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label-select small {
    font-size: 9px;
    color: var(--muted);
  }
  .plot {
    touch-action: none;
    cursor: grab;
    user-select: none;
  }
  .dragging,
  .dragging .plot,
  .dragging .bar {
    cursor: grabbing;
  }
  .lane {
    position: relative;
    border-bottom: 1px solid #e9edf5;
    min-width: 0;
    overflow: hidden;
    background: #fff;
  }
  .lane:nth-child(4n) {
    background: #f8faff;
  }
  .lane.chosen {
    background: #edf3ff;
  }
  .gridline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #e6ecf5;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #9aaecf;
    z-index: 2;
    pointer-events: none;
  }
  .playhead.live {
    background: #d76560;
  }
  .bar {
    position: absolute;
    top: 10px;
    height: 30px;
    padding: 0;
    min-width: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    background: #507dc6;
    border: 1px solid #3c69b1;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    box-shadow: 0 1px 2px #1d38651a;
  }
  .bar[data-kind="agent"] {
    background: #8864bb;
    border-color: #73519f;
  }
  .bar[data-kind="command"] {
    background: #338c86;
    border-color: #27716d;
  }
  .bar[data-kind="input"] {
    background: #ad772e;
    border-color: #956320;
  }
  .bar.failed {
    background: #b65252;
    border-color: #9c3939;
  }
  .bar.interrupted {
    background: #7f8b9d;
    border-style: dashed;
    border-color: #55647b;
  }
  .bar.selected {
    outline: 2px solid #23334c;
    outline-offset: 2px;
    z-index: 2;
  }
  .bar.clipped-start {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 0;
    padding-left: 22px;
  }
  .bar.clipped-end {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 0;
    padding-right: 22px;
  }
  .continuation {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20px;
    display: grid;
    place-items: center;
    background: #17274030;
    font-size: 18px;
    line-height: 1;
    letter-spacing: -2px;
    pointer-events: none;
    z-index: 1;
  }
  .continuation.start {
    left: 0;
    border-right: 1px dashed #ffffff60;
  }
  .continuation.end {
    right: 0;
    border-left: 1px dashed #ffffff60;
  }
  .bar-label {
    position: relative;
    z-index: 1;
    font-size: 11px;
    font-weight: 550;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    padding-left: 8px;
    flex: 1;
  }
  .bar-duration {
    position: relative;
    z-index: 1;
    padding-right: 8px;
    font-size: 9px;
    white-space: nowrap;
    opacity: 0.9;
  }
  .bar.running::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 15%,
      #ffffff0a 30%,
      #ffffff40 50%,
      #ffffff0a 70%,
      transparent 85%
    );
    transform: translateX(-100%);
    animation: shimmer 2.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes shimmer {
    to {
      transform: translateX(100%);
    }
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 5px 15px;
    padding: 10px 12px;
    border-top: 1px solid var(--line);
    font-size: 10px;
    color: var(--muted);
    background: #f8faff;
  }
  .range {
    font-variant-numeric: tabular-nums;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar.running::after {
      animation: none;
      transform: none;
    }
  }
  @media (max-width: 600px) {
    .timeline.expanded {
      inset: 8px;
    }
    .toolbar {
      padding: 8px;
    }
    .zoom-value {
      display: none;
    }
    .grid {
      grid-template-columns: 120px minmax(0, 1fr);
    }
  }
</style>
