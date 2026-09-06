<script lang="ts">
  import { onMount } from "svelte";
  import type { RunDetail } from "$lib/runs.ts";
  import { duration } from "$lib/runs.ts";
  import { buildTimeline, findActivity } from "$lib/timeline.ts";
  import StatusBadge from "./StatusBadge.svelte";
  import Timeline from "./Timeline.svelte";
  import AnsiText from "./AnsiText.svelte";
  import Usage from "./Usage.svelte";
  let { run, connection }: { run: RunDetail; connection: string } = $props();
  let now = $state(Date.now());
  let selected = $state("");
  let tab = $state<"timeline" | "input" | "output" | "logs">("timeline");
  let nodes = $derived(buildTimeline(run.events, run.status));
  let activity = $derived(findActivity(nodes, selected));
  let elapsed = $derived(run.durationMs ?? Math.max(0, now - run.startedAt));
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

<section class="min-w-0" aria-label="Run details">
  <header class="px-8 pt-8 pb-4 max-sm:p-5">
    <div class="flex justify-between gap-2.5">
      <span class="text-base-content/60 text-xs"
        >{run.source === "web"
          ? "Started from web"
          : `Webhook /${run.webhook}`}</span
      ><StatusBadge status={run.status} />
    </div>
    <h1 class="text-3xl tracking-tight font-medium my-3.5 mx-0 wrap-anywhere">
      {run.workflow}
    </h1>
    <div
      class="flex flex-wrap gap-y-2.5 gap-x-5.5 text-base-content/60 text-xs tabular-nums"
    >
      <span>{new Date(run.startedAt).toLocaleString()}</span><span
        >{duration(elapsed)}</span
      >
    </div>
    <Usage usage={run.usage} detail />
    <p
      class="text-base-content/60 text-xs flex justify-between mt-5 mr-0 mb-0 ml-0"
    >
      Run {run.id.slice(0, 8)} <span>{connection}</span>
    </p>
  </header>
  {#if run.error}<div
      class="alert alert-error mt-0 mr-8 mb-2.5 ml-8 max-sm:mx-5"
      role="alert"
    >
      {run.error}
    </div>{/if}
  <nav
    class="tabs tabs-border px-8 border-b border-base-300 max-sm:px-5"
    aria-label="Run views"
  >
    <button
      class="tab gap-2 text-sm"
      class:tab-active={tab === "timeline"}
      onclick={() => (tab = "timeline")}
      >Timeline <span class="badge badge-sm badge-ghost text-xs"
        >{run.events.filter((e) => e.type === "step.started").length}</span
      ></button
    >
    <button
      class="tab gap-2 text-sm"
      class:tab-active={tab === "input"}
      onclick={() => (tab = "input")}>Input</button
    >
    <button
      class="tab gap-2 text-sm"
      class:tab-active={tab === "output"}
      onclick={() => (tab = "output")}>Output</button
    >
    <button
      class="tab gap-2 text-sm"
      class:tab-active={tab === "logs"}
      onclick={() => (tab = "logs")}
      >Logs <span class="badge badge-sm badge-ghost text-xs">{logs.length}</span
      ></button
    >
  </nav>
  <div class="py-6 px-8 max-sm:p-5">
    {#if tab === "timeline"}
      <div class="flex justify-between text-base-content/60 text-xs mb-3.5">
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
        <p class="mt-3 text-base-content/60 text-xs leading-relaxed">
          Select a block to inspect its activity. Collapse a step to focus the
          timeline.
        </p>
      {:else}<div
          class="border border-base-300 border-dashed py-9 px-5 text-base-content/60 rounded-lg text-sm text-center"
        >
          {run.status === "running"
            ? "Waiting for the first workflow event…"
            : "This run did not start any steps."}
        </div>{/if}
      {#if activity}
        <section class="card card-border mt-5 gap-3 p-4 bg-base-200">
          <div class="flex items-center justify-between gap-2.5">
            <h2 class="text-sm font-semibold m-0 wrap-anywhere">
              {activity.label}
            </h2>
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => (selected = "")}
              aria-label="Close activity details">×</button
            >
          </div>
          <p class="text-base-content/60 text-xs leading-relaxed">
            {activity.kind} started at {duration(activity.startedAt)}
          </p>
          {#if activity.usage}<Usage usage={activity.usage} detail />{/if}
          <pre
            class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere max-h-110 overflow-auto"><AnsiText
              text={activity.logs.length
                ? activity.logs.join("\n\n")
                : "No logs for this activity."}
            /></pre>
        </section>
      {/if}
      {#if run.status === "completed" && run.output !== null}
        <section class="mt-6 space-y-3 border-t border-base-300 pt-5">
          <h2 class="text-sm font-semibold m-0 wrap-anywhere">Output</h2>
          <pre
            class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere max-h-110 overflow-auto">{pretty(
              run.output,
            )}</pre>
        </section>
      {/if}
    {:else if tab === "input"}<pre
        class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere overflow-auto m-0">{pretty(
          run.input,
        )}</pre>
    {:else if tab === "output"}<pre
        class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere overflow-auto m-0">{run.status ===
        "running"
          ? "Output will appear when the workflow finishes."
          : pretty(run.output)}</pre>
    {:else}<pre
        class="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere overflow-auto m-0"><AnsiText
          text={logs.length ? logs.join("\n\n") : "No logs yet."}
        /></pre>{/if}
  </div>
</section>
