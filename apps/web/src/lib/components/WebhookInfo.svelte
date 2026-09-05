<script lang="ts">
  import { onMount } from "svelte";
  import type { WebhookInfo } from "$lib/runs.ts";
  import { webhookCurl } from "$lib/webhook-curl.ts";

  let { webhook, onclose }: { webhook: WebhookInfo; onclose: () => void } =
    $props();
  let dialog: HTMLDialogElement;
  let origin = $state("");
  let message = $state("");
  let url = $derived(`${origin}${webhook.path}`);
  let curl = $derived(webhookCurl(url, webhook.input));
  onMount(() => {
    origin = location.origin;
    dialog.showModal();
  });
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      message = `${label} copied.`;
    } catch {
      message =
        "Could not access the clipboard. Select and copy the text below.";
    }
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="hook-info-title">
  <header>
    <div>
      <p>Configured webhook</p>
      <h2 id="hook-info-title">{webhook.name}</h2>
    </div>
    <button
      class="quiet"
      onclick={() => dialog.close()}
      aria-label="Close webhook information">×</button
    >
  </header>
  <div class="content">
    <dl>
      <dt>Workflow</dt>
      <dd>{webhook.workflow}</dd>
      <dt>Method</dt>
      <dd><code>POST</code></dd>
      <dt>Content type</dt>
      <dd><code>application/json</code></dd>
    </dl>
    <p class="hint">
      The request body must match the workflow input schema and is passed
      directly to the workflow. The response returns the workflow result when
      the run finishes.
    </p>
    <section aria-labelledby="hook-url-title">
      <div class="section-head">
        <h3 id="hook-url-title">Webhook URL</h3>
        <button class="quiet" onclick={() => copy(url, "URL")}>Copy URL</button>
      </div>
      <pre>{url}</pre>
    </section>
    <section aria-labelledby="hook-curl-title">
      <div class="section-head">
        <h3 id="hook-curl-title">Example curl command</h3>
        <button class="quiet" onclick={() => copy(curl, "Command")}
          >Copy curl</button
        >
      </div>
      <p class="hint">
        For bash or zsh. This sample comes from the workflow input schema. Check
        its values and add any required authentication headers before use.
      </p>
      <pre>{curl}</pre>
    </section>
    <p class="copy-status" role="status">{message}</p>
    <section aria-labelledby="hook-schemas-title">
      <h3 id="hook-schemas-title">Schemas</h3>
      <details>
        <summary>Workflow input</summary>
        <pre>{JSON.stringify(webhook.input, null, 2)}</pre>
      </details>
      <details>
        <summary>Workflow output</summary>
        <pre>{JSON.stringify(webhook.output, null, 2)}</pre>
      </details>
    </section>
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line);
    border-radius: 12px;
    width: min(700px, calc(100vw - 32px));
    padding: 0;
    color: var(--ink);
    box-shadow: 0 30px 120px #15274738;
    max-height: 90vh;
  }
  dialog::backdrop {
    background: #1e304e65;
    backdrop-filter: blur(3px);
  }
  header,
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  header {
    padding: 25px 28px 16px;
  }
  header p {
    color: var(--muted);
    font-size: 12px;
    margin: 0 0 8px;
  }
  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  h3 {
    font-size: 13px;
    font-weight: 550;
    margin: 0;
  }
  .content {
    padding: 0 28px 28px;
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px 20px;
    font-size: 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  section {
    margin-top: 22px;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.6;
  }
  .section-head button {
    flex-shrink: 0;
    font-size: 12px;
  }
  pre {
    background: var(--wash);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 14px;
    font-size: 11px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 280px;
    overflow: auto;
  }
  .copy-status {
    min-height: 1.5em;
    font-size: 12px;
    color: var(--muted);
  }
  details {
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  summary {
    padding: 12px 0;
    cursor: pointer;
  }
</style>
