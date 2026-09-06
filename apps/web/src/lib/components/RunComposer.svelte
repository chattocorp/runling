<script lang="ts">
  import { onMount } from "svelte";
  import type { WebhookInfo } from "$lib/runs.ts";
  import { sample } from "$lib/sample.ts";
  import { submitFormShortcut } from "$lib/form-shortcut.ts";
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
    if (pending) return;
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

<dialog
  class="modal modal-middle"
  bind:this={dialog}
  {onclose}
  aria-labelledby="composer-title"
>
  <div class="modal-box w-11/12 max-w-2xl p-0">
    <div class="flex justify-between items-center px-6 pt-6 pb-4">
      <div>
        <p class="text-base-content/60 text-xs mt-0 mr-0 mb-2 ml-0">New run</p>
        <h2 class="m-0 text-2xl font-medium" id="composer-title">
          {webhook.workflow}
        </h2>
      </div>
      <button
        class="btn btn-ghost btn-sm"
        onclick={() => dialog.close()}
        aria-label="Close new run">×</button
      >
    </div>
    <div class="mx-6 flex items-center gap-2.5 bg-base-200 p-3 rounded-md">
      <code class="font-mono flex-1 wrap-anywhere text-xs"
        >{origin}{webhook.path}</code
      ><button class="btn btn-ghost btn-sm text-xs shrink-0" onclick={copy}
        >{copied ? "Copied" : "Copy URL"}</button
      >
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Handles the submit shortcut from focused form controls.) -->
    <form class="p-6" onsubmit={start} onkeydown={(event) => submitFormShortcut(event, pending)}>
      <label class="label mb-2 font-medium text-sm" for="request-body">Request body</label>
      <p class="text-xs text-base-content/60 leading-relaxed">
        Edit the sample request. The schema below defines the accepted values.
      </p>
      <textarea
        class="textarea w-full min-h-48 font-mono text-sm leading-relaxed resize-y"
        id="request-body"
        bind:value={body}
        spellcheck="false"
        rows="8"
        aria-describedby={error ? "request-error" : undefined}></textarea>
      <details
        class="collapse collapse-arrow border border-base-300 bg-base-200 mt-3"
      >
        <summary class="collapse-title text-sm font-medium"
          >Inspect schemas</summary
        >
        <div class="collapse-content">
          <div class="flex gap-2 my-3.5 mx-0 flex-wrap">
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              class:btn-active={schemaTab === "input"}
              onclick={() => (schemaTab = "input")}>Workflow input</button
            ><button
              class="btn btn-sm btn-ghost"
              type="button"
              class:btn-active={schemaTab === "output"}
              onclick={() => (schemaTab = "output")}>Workflow output</button
            >
          </div>
          <pre
            class="font-mono max-h-56 overflow-auto text-xs leading-relaxed">{JSON.stringify(
              webhook[schemaTab],
              null,
              2,
            )}</pre>
        </div>
      </details>
      {#if error}<p id="request-error" class="alert alert-error" role="alert">
          {error}
        </p>{/if}
      <footer class="flex gap-5 items-center justify-between mt-6">
        <span class="text-xs text-base-content/60 leading-relaxed"
          >Cmd/Ctrl+Enter to start. The run continues if you close this window.</span
        ><button class="btn btn-sm btn-primary" disabled={pending} aria-keyshortcuts="Meta+Enter Control+Enter"
          >{pending ? "Starting…" : "Start run"}</button
        >
      </footer>
    </form>
  </div>
</dialog>
