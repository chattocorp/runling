<script lang="ts">
  import { onMount } from "svelte";
  import type { RunDetail } from "$lib/runs.ts";
  import { duration } from "$lib/runs.ts";
  import { buildTimeline, findActivity } from "$lib/timeline.ts";
  import StatusBadge from "./StatusBadge.svelte";
  import Timeline from "./Timeline.svelte";
  let { run, connection }: { run: RunDetail; connection: string } = $props();
  let now = $state(Date.now());
  let selected = $state("");
  let tab = $state<"timeline" | "input" | "output" | "logs">("timeline");
  let nodes = $derived(buildTimeline(run.events, run.status));
  let activity = $derived(findActivity(nodes, selected));
  let elapsed = $derived(run.durationMs ?? Math.max(0, now - run.startedAt));
  let tokenCount = $derived(
    run.usage.input +
      run.usage.output +
      run.usage.cacheRead +
      run.usage.cacheWrite,
  );
  let logs = $derived(
    run.events.filter((e) => e.type === "log").map((e) => e.message),
  );
  const pretty = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 500);
    return () => clearInterval(timer);
  });
</script>

<section class="inspector" aria-label="Run details">
  <header>
    <div class="run-top">
      <span class="source"
        >{run.source === "web"
          ? "Started from web"
          : `Webhook /${run.webhook}`}</span
      ><StatusBadge status={run.status} />
    </div>
    <h1>{run.workflow}</h1>
    <div class="facts">
      <span>{new Date(run.startedAt).toLocaleString()}</span><span
        >{duration(elapsed)}</span
      ><span>{tokenCount.toLocaleString()} tokens</span
      >{#if run.usage.cost !== undefined}<span
          >${run.usage.cost.toFixed(4)}</span
        >{/if}
    </div>
    <p class="run-id">Run {run.id.slice(0, 8)} <span>{connection}</span></p>
  </header>
  {#if run.error}<div class="error" role="alert">{run.error}</div>{/if}
  <nav class="tabs" aria-label="Run views">
    <button class:active={tab === "timeline"} onclick={() => (tab = "timeline")}
      >Timeline <span
        >{run.events.filter((e) => e.type === "step.started").length}</span
      ></button
    >
    <button class:active={tab === "input"} onclick={() => (tab = "input")}
      >Input</button
    >
    <button class:active={tab === "output"} onclick={() => (tab = "output")}
      >Output</button
    >
    <button class:active={tab === "logs"} onclick={() => (tab = "logs")}
      >Logs <span>{logs.length}</span></button
    >
  </nav>
  <div class="content">
    {#if tab === "timeline"}
      <div class="scale">
        <span>Execution timeline</span><span>0 → {duration(elapsed)}</span>
      </div>
      {#if nodes.length}
        <Timeline
          {nodes}
          {selected}
          onselect={(id) => (selected = selected === id ? "" : id)}
          {elapsed}
          running={run.status === "running"}
        />
        <p class="hint">
          Select a block to inspect its activity. Collapse a step to focus the
          timeline.
        </p>
      {:else}<div class="empty">
          {run.status === "running"
            ? "Waiting for the first workflow event…"
            : "This run did not start any steps."}
        </div>{/if}
      {#if activity}
        <section class="activity-detail">
          <div class="detail-head">
            <h2>{activity.label}</h2>
            <button
              class="quiet"
              onclick={() => (selected = "")}
              aria-label="Close activity details">×</button
            >
          </div>
          <p class="hint">
            {activity.kind} started at {duration(activity.startedAt)}
          </p>
          <pre>{activity.logs.length
              ? activity.logs.join("\n\n")
              : "No logs for this activity."}</pre>
        </section>
      {/if}
      {#if run.status === "completed" && run.output !== null}
        <section class="result">
          <h2>Output</h2>
          <pre>{pretty(run.output)}</pre>
        </section>
      {/if}
    {:else if tab === "input"}<pre class="document">{pretty(run.input)}</pre>
    {:else if tab === "output"}<pre class="document">{run.status === "running"
          ? "Output will appear when the workflow finishes."
          : pretty(run.output)}</pre>
    {:else}<pre class="document">{logs.length
          ? logs.join("\n\n")
          : "No logs yet."}</pre>{/if}
  </div>
</section>

<style>
  .inspector {
    min-width: 0;
  }
  header {
    padding: 30px 32px 18px;
  }
  .run-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .source {
    color: var(--muted);
    font-size: 12px;
  }
  h1 {
    font-size: 28px;
    letter-spacing: -0.7px;
    font-weight: 550;
    margin: 14px 0;
    overflow-wrap: anywhere;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 22px;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .run-id {
    color: var(--muted);
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    margin: 20px 0 0;
  }
  .tabs {
    display: flex;
    padding: 0 32px;
    gap: 25px;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    padding: 15px 0 13px;
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
  }
  .tabs button.active {
    border-bottom-color: var(--blue);
    color: var(--blue);
  }
  .tabs span {
    margin-left: 5px;
    font-size: 10px;
    background: var(--wash);
    padding: 2px 5px;
    border-radius: 4px;
  }
  .content {
    padding: 24px 32px;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 11px;
    margin-bottom: 14px;
  }
  .hint {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.7;
  }
  .activity-detail {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-top: 20px;
    padding: 16px;
    background: white;
  }
  .detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  h2 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .result {
    margin-top: 24px;
    border-top: 1px solid var(--line);
    padding-top: 20px;
  }
  pre {
    font-size: 12px;
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 440px;
    overflow: auto;
  }
  .document {
    margin: 0;
    max-height: none;
  }
  .error {
    margin: 0 32px 10px;
  }
  .empty {
    border: 1px dashed var(--line);
    padding: 35px 20px;
    color: var(--muted);
    border-radius: 8px;
    font-size: 13px;
    text-align: center;
  }
  @media (max-width: 700px) {
    header,
    .content {
      padding: 20px;
    }
    .tabs {
      padding: 0 20px;
      gap: 20px;
    }
    .error {
      margin-inline: 20px;
    }
  }
</style>
