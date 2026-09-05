<script lang="ts">
  import { onMount } from "svelte";
  import type { WebhookInfo } from "$lib/runs.ts";
  import { sample } from "$lib/sample.ts";
  let {
    webhook,
    onclose,
    onstarted,
  }: {
    webhook: WebhookInfo;
    onclose: () => void;
    onstarted: (id: string) => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let body = $state("");
  let pending = $state(false);
  let error = $state("");
  let schemaTab = $state<"input" | "output">("input");
  let origin = $state("");
  let copied = $state(false);
  onMount(() => {
    body = JSON.stringify(sample(webhook.input), null, 2);
    origin = location.origin;
    dialog.showModal();
  });
  async function start(event: SubmitEvent) {
    event.preventDefault();
    error = "";
    try {
      JSON.parse(body);
    } catch {
      error = "Enter valid JSON before starting the run.";
      return;
    }
    pending = true;
    try {
      const response = await fetch(
        `/api/runs/start/${encodeURIComponent(webhook.name)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          [
            result.error ?? "Could not start the run.",
            ...(result.issues ?? []).map(
              (issue: { path: string; message: string }) =>
                `${issue.path}: ${issue.message}`,
            ),
          ].join("\n"),
        );
      onstarted(result.id);
      dialog.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      pending = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}${webhook.path}`);
      copied = true;
    } catch {
      error =
        "Could not copy the URL. Select and copy it from the address below.";
    }
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="composer-title">
  <div class="dialog-head">
    <div>
      <p>New run</p>
      <h2 id="composer-title">{webhook.workflow}</h2>
    </div>
    <button
      class="quiet"
      onclick={() => dialog.close()}
      aria-label="Close new run">×</button
    >
  </div>
  <div class="endpoint">
    <code>{origin}{webhook.path}</code><button class="quiet" onclick={copy}
      >{copied ? "Copied" : "Copy URL"}</button
    >
  </div>
  <form onsubmit={start}>
    <label for="request-body">Request body</label>
    <p class="hint">
      Edit the sample request. The schema below defines the accepted values.
    </p>
    <textarea
      id="request-body"
      bind:value={body}
      spellcheck="false"
      rows="8"
      aria-describedby={error ? "request-error" : undefined}></textarea>
    <details>
      <summary>Inspect schemas</summary>
      <div class="schema-tabs">
        <button
          type="button"
          class:active={schemaTab === "input"}
          onclick={() => (schemaTab = "input")}>Workflow input</button
        ><button
          type="button"
          class:active={schemaTab === "output"}
          onclick={() => (schemaTab = "output")}>Workflow output</button
        >
      </div>
      <pre>{JSON.stringify(webhook[schemaTab], null, 2)}</pre>
    </details>
    {#if error}<p id="request-error" class="error" role="alert">{error}</p>{/if}
    <footer>
      <span>The run continues if you close this window.</span><button
        class="button primary"
        disabled={pending}>{pending ? "Starting…" : "Start run"}</button
      >
    </footer>
  </form>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line);
    border-radius: 12px;
    width: min(650px, calc(100vw - 32px));
    padding: 0;
    color: var(--ink);
    box-shadow: 0 30px 120px #15274738;
    max-height: 90vh;
  }
  dialog::backdrop {
    background: #1e304e65;
    backdrop-filter: blur(3px);
  }
  .dialog-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 25px 28px 16px;
  }
  .dialog-head p {
    color: var(--muted);
    font-size: 12px;
    margin: 0 0 8px;
  }
  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 550;
  }
  .endpoint {
    margin: 0 28px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--wash);
    padding: 12px;
    border-radius: 6px;
  }
  code {
    flex: 1;
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  .endpoint button {
    font-size: 11px;
    flex-shrink: 0;
  }
  form {
    padding: 24px 28px;
  }
  label {
    font-weight: 550;
    font-size: 13px;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.6;
  }
  textarea {
    width: 100%;
    resize: vertical;
    box-sizing: border-box;
    padding: 14px;
    border: 1px solid #b8c8dd;
    border-radius: 6px;
    font:
      13px/1.7 "SFMono-Regular",
      Consolas,
      monospace;
    background: #fafcff;
    color: var(--ink);
  }
  details {
    margin-top: 18px;
    font-size: 12px;
  }
  summary {
    cursor: pointer;
    color: var(--muted);
    padding: 5px 0;
  }
  .schema-tabs {
    display: flex;
    gap: 8px;
    margin: 14px 0;
    flex-wrap: wrap;
  }
  .schema-tabs button {
    font-size: 11px;
    padding: 6px 9px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: white;
    cursor: pointer;
  }
  .schema-tabs button.active {
    color: var(--blue);
    border-color: var(--blue);
  }
  pre {
    max-height: 230px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.7;
  }
  footer {
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: space-between;
    margin-top: 25px;
  }
  footer span {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
  }
</style>
