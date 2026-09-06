<script lang="ts">
  import ThemePicker from "$lib/components/ThemePicker.svelte";
  import SidebarToggle from "$lib/components/SidebarToggle.svelte";
  import { isSidebarShortcut } from "$lib/sidebar-shortcut.ts";
  import Usage from "$lib/components/Usage.svelte";
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import type { PageData } from "./$types";
  import {
    applyRecord,
    duration,
    type RunDetail,
    type RunRecord,
    type RunSummary,
    type WebhookInfo,
  } from "$lib/runs.ts";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import RunInspector from "$lib/components/RunInspector.svelte";
  import RunComposer from "$lib/components/RunComposer.svelte";
  import WebhookInfoModal from "$lib/components/WebhookInfo.svelte";

  let { data }: { data: PageData } = $props();
  let liveRuns = $state<RunSummary[] | null>(null);
  let runs = $derived(liveRuns ?? data.runs);
  let filter = $state("");
  let visibleRuns = $derived(
    runs.filter((run) => !filter || run.webhook === filter),
  );
  let activeCount = $derived(
    runs.filter((run) => run.status === "running").length,
  );
  let selected = $state("");
  let detail = $state<RunDetail | null>(null);
  let connection = $state("Connecting…");
  let detailError = $state("");
  let listConnected = $state(false);
  let composer = $state<WebhookInfo | null>(null);
  let hookInfo = $state<WebhookInfo | null>(null);
  let copied = $state("");
  let notice = $state("");
  let configError = $state("");
  let sidebarsExpanded = $state(true);

  function handleSidebarShortcut(event: KeyboardEvent) {
    if (!isSidebarShortcut(event)) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
    ) return;
    event.preventDefault();
    if (!event.repeat) toggleSidebars();
  }

  function toggleSidebars() {
    sidebarsExpanded = !sidebarsExpanded;
    try {
      localStorage.setItem(
        "runling-sidebars",
        sidebarsExpanded ? "expanded" : "collapsed",
      );
    } catch {
      // Layout controls also work when browser storage is unavailable.
    }
  }
  let runStream: EventSource | undefined;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function selectRun(id: string) {
    runStream?.close();
    selected = id;
    detail = null;
    detailError = "";
    connection = "Connecting…";
    const url = new URL(location.href);
    url.searchParams.set("run", id);
    history.replaceState(null, "", url);
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "Run not found."
            : "Could not load this run.",
        );
      const saved = (await response.json()) as RunDetail;
      if (selected !== id) return;
      detail = saved;
      if (saved.status !== "running") {
        connection = "Saved";
        return;
      }
    } catch (cause) {
      if (selected === id)
        detailError = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    const stream = new EventSource(
      `/api/runs/${encodeURIComponent(id)}/events`,
    );
    runStream = stream;
    stream.addEventListener("snapshot", (event) => {
      if (selected !== id) return;
      detail = JSON.parse(event.data) as RunDetail;
      connection = detail.status === "running" ? "Live" : "Saved";
      if (detail.status !== "running") stream.close();
    });
    stream.addEventListener("record", (event) => {
      if (!detail || selected !== id) return;
      const record = JSON.parse(event.data) as RunRecord;
      detail = applyRecord(detail, record);
      if (detail.status !== "running") {
        connection = "Saved";
        stream.close();
      }
    });
    stream.onopen = () => {
      connection = "Live";
    };
    stream.onerror = () => {
      connection = "Connection lost. Retrying…";
    };
  }

  async function copyUrl(webhook: WebhookInfo) {
    notice = "";
    try {
      await navigator.clipboard.writeText(`${location.origin}${webhook.path}`);
      copied = webhook.name;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = "";
      }, 2200);
    } catch {
      notice = `Copy this URL: ${location.origin}${webhook.path}`;
    }
  }

  onMount(() => {
    try {
      sidebarsExpanded = localStorage.getItem("runling-sidebars") !== "collapsed";
    } catch {
      // Keep the default layout when browser storage is unavailable.
    }
    const configs = new EventSource("/api/config/events");
    let revision: number | undefined;
    configs.onopen = () => {
      revision = undefined;
    };
    configs.addEventListener("config", (event) => {
      const update = JSON.parse(event.data) as {
        revision: number;
        error: string | null;
      };
      configError = update.error ?? "";
      if (revision !== update.revision) {
        revision = update.revision;
        composer = null;
        hookInfo = null;
        void invalidateAll();
      }
    });
    const stream = new EventSource("/api/runs/events");
    stream.addEventListener("runs", (event) => {
      liveRuns = JSON.parse(event.data);
      listConnected = true;
    });
    stream.onerror = () => {
      listConnected = false;
    };
    const initial =
      new URL(location.href).searchParams.get("run") ?? data.runs[0]?.id;
    if (initial) selectRun(initial);
    return () => {
      configs.close();
      stream.close();
      runStream?.close();
      clearTimeout(copyTimer);
    };
  });
</script>

<svelte:window onkeydown={handleSidebarShortcut} />

<svelte:head
  ><title>Runling — Runs</title><meta
    name="description"
    content="Start workflows and inspect their live execution."
  /></svelte:head
>

<div class="app">
  {#if configError}<div class="error" role="alert">
      Configuration reload failed. The last valid configuration is still active. {configError}
    </div>{/if}
  <header class="app-header">
    <div class="header-navigation">
      <SidebarToggle expanded={sidebarsExpanded} onclick={toggleSidebars} />
      <a href="/" class="brand" aria-label="Runling home"
        ><svg
          viewBox="0 0 28 28"
          width="26"
          height="26"
          fill="none"
          aria-hidden="true"
          ><path d="M3 25V12l7 4V9l7 4V3h7v22H3Z" fill="currentColor" /><path
            d="M7 21h3m4 0h3m3 0h2"
            stroke="white"
            stroke-width="2"
          /></svg
        >runling<span> / </span><span class="section-name">Run console</span></a
      >
    </div>
    <div class="header-actions">
      <ThemePicker />
      <span class="live-label" class:connected={listConnected}
        ><i></i>{listConnected ? "Connected" : "Reconnecting"}</span
      ><button
        class="button primary"
        disabled={!data.webhooks.length}
        onclick={() =>
          (composer =
            data.webhooks.find((hook) => hook.name === filter) ??
            data.webhooks[0] ??
            null)}>＋ New run</button
      >
    </div>
  </header>
  {#if notice}<div class="notice" role="status">
      {notice}<button
        class="quiet"
        onclick={() => (notice = "")}
        aria-label="Dismiss notice">×</button
      >
    </div>{/if}
  <div class="workspace" class:sidebars-collapsed={!sidebarsExpanded}>
    <aside class="catalog" id="webhook-sidebar" hidden={!sidebarsExpanded}>
      <div class="sidebar-heading">
        <h2>Webhooks</h2>
        <span>{data.webhooks.length}</span>
      </div>
      <button
        class="all-runs"
        class:current={!filter}
        onclick={() => (filter = "")}
        ><span>All runs</span><span>{runs.length}</span></button
      >
      <div class="webhooks">
        {#each data.webhooks as webhook}
          <div class="webhook" class:current={filter === webhook.name}>
            <button class="webhook-name" onclick={() => (filter = webhook.name)}
              ><span class="hook-icon">↳</span><span
                ><strong>{webhook.name}</strong><small>{webhook.workflow}</small
                ></span
              ></button
            >
            <div class="hook-actions">
              <button
                onclick={() => (hookInfo = webhook)}
                aria-label={`Information about ${webhook.name}`}>Info</button
              >
              <button
                onclick={() => copyUrl(webhook)}
                aria-label={`Copy URL for ${webhook.name}`}
                >{copied === webhook.name ? "✓ Copied" : "Copy URL"}</button
              ><button
                onclick={() => (composer = webhook)}
                aria-label={`Run ${webhook.name}`}>Run ↗</button
              >
            </div>
          </div>
        {:else}<p class="sidebar-empty">
            No webhooks configured. Add one to runling.config.ts. Changes load
            automatically.
          </p>{/each}
      </div>
      <div class="catalog-foot">
        <span class="count">{activeCount}</span><span
          >running now<br /><small>History saved automatically</small></span
        >
      </div>
    </aside>
    <section
      class="run-list"
      id="runs-sidebar"
      hidden={!sidebarsExpanded}
      aria-label="Workflow runs"
    >
      <div class="list-header">
        <h2>{filter || "Recent runs"}</h2>
        <span>{visibleRuns.length}</span>
      </div>
      <div class="runs">
        {#each visibleRuns as run (run.id)}
          <button
            class="run-row"
            class:selected={selected === run.id}
            onclick={() => selectRun(run.id)}
            aria-pressed={selected === run.id}
            title={`Run ${run.id} · ${new Date(run.startedAt).toLocaleString()}`}
          >
            <span class="run-heading">
              <span class="run-title">{run.workflow}</span>
              <time datetime={new Date(run.startedAt).toISOString()}
                >{new Date(run.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}</time>
            </span><span class="run-meta"
              ><StatusBadge status={run.status} /><span
                >{run.durationMs !== undefined
                  ? duration(run.durationMs)
                  : "In progress"}</span
              ></span
            >
            <Usage usage={run.usage} compact />
          </button>
        {:else}<div class="list-empty">
            <span>◇</span>
            <p>No runs yet.</p>
            <small
              >Start a run or send a webhook to see its progress here.</small
            >
          </div>{/each}
      </div>
      <div class="list-foot">Latest 100 runs</div>
    </section>
    <main class="detail-pane">
      {#if detail}
        {#key detail.id}<RunInspector run={detail} {connection} />{/key}
      {:else if selected}<div class="welcome">
          <div class="loading-mark">◌</div>
          <h1>{detailError ? "Run unavailable" : "Loading run"}</h1>
          <p>{detailError || connection}</p>
          {#if detailError}<button
              class="button"
              onclick={() => selectRun(selected)}>Retry</button
            >{/if}
        </div>
      {:else}
        <div class="welcome">
          <div class="welcome-mark" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <h1>Follow the work.</h1>
          <p>Every step, from the first request<br />to the final result.</p>
          <button
            class="button primary"
            disabled={!data.webhooks.length}
            onclick={() => (composer = data.webhooks[0] ?? null)}
            >Start your first run</button
          ><small>Or select a past run to inspect its timeline.</small>
        </div>
      {/if}
    </main>
  </div>
</div>
{#if hookInfo}<WebhookInfoModal
    webhook={hookInfo}
    onclose={() => (hookInfo = null)}
  />{/if}
{#if composer}<RunComposer
    webhook={composer}
    onclose={() => (composer = null)}
    onstarted={(id) => {
      filter = "";
      selectRun(id);
    }}
  />{/if}

<style>
  :global(:root) {
    --ink: #23334c;
    --muted: #65758e;
    --blue: #315fce;
    --green: #28735c;
    --red: #b13f3c;
    --line: #dce3ee;
    --wash: #edf2f8;
    color: var(--ink);
    background: #f6f8fc;
    font-synthesis: none;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  :global(button),
  :global(textarea) {
    font-family: inherit;
  }
  :global(button) {
    touch-action: manipulation;
  }
  :global(button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  :global(:focus-visible) {
    outline: 2px solid var(--blue);
    outline-offset: 3px;
  }
  :global(pre),
  :global(code) {
    font-family: "SFMono-Regular", Consolas, monospace;
  }
  :global(.button) {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 15px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 550;
    background: var(--surface);
    color: var(--ink);
  }
  :global(.button.primary) {
    background: var(--primary-bg);
    color: white;
    border-color: var(--primary-bg);
    box-shadow: 0 2px 3px #24479719;
  }
  :global(.button.primary:hover:not(:disabled)) {
    background: var(--primary-hover);
  }
  :global(.quiet) {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 5px;
  }
  :global(.error) {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 13px 15px;
    font-size: 12px;
    line-height: 1.7;
    border-radius: 6px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .app {
    min-height: 100vh;
  }
  .app-header {
    height: 74px;
    padding: 0 30px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
  }
  .header-navigation {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 22px;
    font-weight: 650;
    text-decoration: none;
    letter-spacing: -0.7px;
    color: var(--ink);
  }
  .brand svg {
    color: var(--blue);
  }
  .brand > span {
    color: #b1bccd;
    margin-left: 9px;
    font-weight: 400;
  }
  .brand .section-name {
    color: var(--muted);
    font-size: 13px;
    letter-spacing: 0;
    margin-left: 0;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .live-label {
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
  }
  .live-label i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9aa5b7;
  }
  .connected i {
    background: var(--green);
  }
  .workspace {
    display: grid;
    grid-template-columns: 238px 270px minmax(0, 1fr);
    min-height: calc(100vh - 74px);
  }
  .catalog {
    padding: 0 12px 16px;
    background: var(--surface-raised);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
  }
  .sidebar-heading,
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--muted);
  }
  .sidebar-heading {
    margin: 0 10px;
    min-height: 52px;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .all-runs {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    font-size: 12px;
    color: var(--muted);
    cursor: pointer;
    margin-bottom: 8px;
  }
  .all-runs.current {
    background: var(--selected);
    color: var(--selected-text);
  }
  .webhook {
    border: 1px solid transparent;
    border-radius: 7px;
    margin-bottom: 4px;
  }
  .webhook.current {
    background: var(--surface-soft);
    border-color: var(--selected-border);
  }
  .webhook-name {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    background: none;
    border: 0;
    padding: 9px 8px 4px;
    color: var(--ink);
    cursor: pointer;
  }
  .webhook-name strong {
    font-size: 13px;
    font-weight: 600;
    display: block;
    overflow-wrap: anywhere;
  }
  .webhook-name small {
    display: block;
    color: var(--muted);
    font-size: 11px;
    margin-top: 2px;
  }
  .hook-icon {
    width: 20px;
    height: 24px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: var(--blue);
    font-size: 17px;
  }
  .hook-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 0 6px 6px 30px;
  }
  .hook-actions button {
    font-size: 10px;
    color: var(--muted);
    padding: 5px 6px;
    min-height: 26px;
    border-radius: 4px;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .hook-actions button:hover {
    color: var(--blue);
    background: var(--selected);
  }
  .catalog-foot {
    margin-top: auto;
    padding: 35px 12px 0;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    line-height: 1.7;
  }
  .catalog-foot .count {
    font-size: 33px;
    font-weight: 400;
    color: var(--blue);
  }
  .catalog-foot small {
    color: var(--muted);
    font-size: 10px;
  }
  .sidebar-empty {
    font-size: 12px;
    line-height: 1.8;
    color: var(--muted);
    margin: 12px;
  }
  .run-list {
    border-right: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .list-header {
    padding: 0 16px;
    min-height: 52px;
  }
  .list-header h2 {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .runs {
    flex: 1;
  }
  .run-row {
    display: block;
    width: 100%;
    background: transparent;
    border: 0;
    border-left: 3px solid transparent;
    border-top: 1px solid var(--surface-raised);
    padding: 12px 14px 12px 13px;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }
  .run-row.selected {
    background: var(--selected);
    border-left-color: var(--blue);
  }
  .run-row:hover {
    background: var(--surface-soft);
  }
  .run-row.selected:hover {
    background: var(--selected);
  }
  .run-heading {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 7px;
  }
  .run-heading time {
    flex-shrink: 0;
    font-size: 9px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .run-title {
    display: block;
    font-size: 13px;
    font-weight: 550;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .run-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    font-size: 10px;
    color: var(--muted);
  }
  .list-empty {
    padding: 35px 22px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .list-empty > span {
    font-size: 25px;
    color: var(--selected-border);
  }
  .list-empty p {
    margin: 12px 0 5px;
  }
  .list-empty small {
    font-size: 12px;
  }
  .list-foot {
    border-top: 1px solid var(--line);
    color: #7e8b9f;
    font-size: 10px;
    padding: 16px 20px;
  }
  .detail-pane {
    min-width: 0;
    background: var(--surface-soft);
  }
  .welcome {
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 40px;
    text-align: center;
  }
  .welcome h1 {
    font-size: 32px;
    letter-spacing: -0.9px;
    font-weight: 500;
    margin: 28px 0 0;
  }
  .welcome p {
    font-size: 14px;
    line-height: 1.8;
    color: var(--muted);
    margin: 15px 0 26px;
  }
  .welcome small {
    font-size: 11px;
    margin-top: 20px;
    color: var(--muted);
  }
  .welcome-mark {
    width: 120px;
    display: grid;
    gap: 9px;
    padding-left: 20px;
    border-left: 1px solid var(--selected-border);
    transform: rotate(-8deg);
  }
  .welcome-mark span {
    height: 24px;
    border: 1px solid var(--selected-border);
    background: var(--selected);
    border-radius: 4px;
  }
  .welcome-mark span:nth-child(2) {
    margin-left: 16px;
    background: var(--selected);
  }
  .welcome-mark span:nth-child(3) {
    margin-left: 16px;
    width: 44px;
  }
  .loading-mark {
    font-size: 40px;
    color: var(--blue);
  }
  .notice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px 30px;
    font-size: 12px;
    background: var(--selected);
    overflow-wrap: anywhere;
  }
  @media (min-width: 1050px) {
    .workspace {
      height: calc(100vh - 74px);
      min-height: 0;
    }
    .catalog,
    .runs,
    .detail-pane {
      overflow-y: auto;
    }
  }
  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: 205px 235px minmax(0, 1fr);
    }
    .brand .section-name {
      display: none;
    }
  }
  @media (max-width: 850px) {
    .workspace {
      grid-template-columns: 215px minmax(0, 1fr);
    }
    .catalog {
      grid-column: 1 / -1;
      padding: 15px;
      border-bottom: 1px solid var(--line);
    }
    .sidebar-heading,
    .catalog-foot {
      display: none;
    }
    .webhooks {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .webhook {
      margin: 0;
    }
    .all-runs {
      max-width: 180px;
      margin: 0 0 8px;
      gap: 30px;
    }
    .welcome {
      padding: 30px 20px;
    }
  }
  @media (max-width: 580px) {
    .app-header {
      padding: 12px 16px;
      min-height: 64px;
      height: auto;
      flex-wrap: wrap;
      gap: 12px;
    }
    .header-actions {
      gap: 10px;
    }
    .live-label {
      display: none;
    }
    .brand > span {
      display: none;
    }
    .workspace {
      display: flex;
      flex-direction: column;
    }
    .run-list {
      max-height: 230px;
      overflow-y: auto;
      border-bottom: 1px solid var(--line);
    }
    .runs {
      display: flex;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .run-row {
      min-width: 210px;
      border-right: 1px solid var(--line);
    }
    .list-header {
      padding: 14px 20px;
      min-height: auto;
    }
    .list-foot {
      display: none;
    }
    .welcome {
      min-height: 50vh;
    }
  }

  .workspace.sidebars-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .catalog[hidden],
  .run-list[hidden] {
    display: none;
  }
</style>
