<script lang="ts">
  import type { RunDetail } from "$lib/runs.ts";

  let { run }: { run: RunDetail } = $props();
  let wrap = $state(true);
  let copyState = $state<"idle" | "copied" | "failed">("idle");
  let text = $derived(
    typeof run.output === "string"
      ? run.output
      : JSON.stringify(run.output, null, 2),
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copyState = "copied";
    } catch {
      copyState = "failed";
    }
  }
</script>

{#if run.status === "running" || run.output === null}
  <section class="flex items-start gap-3 rounded-lg border border-dashed border-base-300 p-6" aria-label="Workflow output">
    <span
      class={run.status === "running" ? "loading loading-spinner loading-sm text-base-content/50" : "icon-[lucide--file-text] size-5 shrink-0 text-base-content/50"}
      aria-hidden="true"
    ></span>
    <div class="space-y-1">
      <h2 class="text-sm font-medium">{run.status === "running" ? "Waiting for output" : "No output returned"}</h2>
      <p class="text-xs leading-relaxed text-base-content/60">
        {run.status === "running"
          ? "The result will appear here when the workflow finishes. Follow its progress in Timeline or Logs."
          : "This run did not return a result. Check Timeline or Logs for activity details."}
      </p>
    </div>
  </section>
{:else}
  <section class="overflow-hidden rounded-lg border border-base-300" aria-label="Workflow output">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 bg-base-200/50 px-4 py-2">
      <div class="flex items-center gap-2">
        <span class="icon-[lucide--file-text] size-4 text-base-content/50" aria-hidden="true"></span>
        <h2 class="text-sm font-medium">Result</h2>
        <span class="badge badge-ghost badge-sm text-xs">{typeof run.output === "string" ? "Text" : "JSON"}</span>
      </div>
      <div class="flex items-center gap-1">
        <button class="btn btn-ghost btn-sm cursor-pointer gap-1.5" aria-pressed={wrap} onclick={() => (wrap = !wrap)}>
          <span class="icon-[lucide--wrap-text] size-4" aria-hidden="true"></span>
          Wrap
        </button>
        <button class="btn btn-ghost btn-sm cursor-pointer gap-1.5" onclick={copy}>
          <span class={copyState === "copied" ? "icon-[lucide--check] size-4" : "icon-[lucide--copy] size-4"} aria-hidden="true"></span>
          {copyState === "copied" ? "Copied" : "Copy output"}
        </button>
      </div>
    </header>
    <div class="max-h-[70vh] overflow-auto p-5">
      {#if text === ""}
        <p class="text-sm text-base-content/60">The workflow returned an empty string.</p>
      {:else}
        <pre class="m-0 font-mono text-sm leading-7 {wrap ? 'whitespace-pre-wrap wrap-anywhere' : 'whitespace-pre'}">{text}</pre>
      {/if}
    </div>
    <p role="status" class="sr-only">{copyState === "copied" ? "Output copied to clipboard." : ""}</p>
    {#if copyState === "failed"}
      <p role="alert" class="border-t border-base-300 px-4 py-2 text-xs text-error">Could not copy to the clipboard. Select the output and copy it manually.</p>
    {/if}
  </section>
{/if}
