<script lang="ts">
  import type { TokenUsage } from "runling";
  import { estimatedCost, tokenCount } from "$lib/usage.ts";
  let { usage, detail = false, compact = false }: { usage: TokenUsage; detail?: boolean; compact?: boolean } =
    $props();
</script>

<span
  class="usage"
  class:compact
  title={`${tokenCount(usage).toLocaleString()} tokens · ${estimatedCost(usage)}. Estimated model cost in USD, not an invoice. Totals include child activities.`}
>
  <span>{tokenCount(usage).toLocaleString()} tokens</span>
  <span>{estimatedCost(usage)}</span>
</span>
{#if detail}
  <dl>
    <div>
      <dt>Input</dt>
      <dd>{usage.input.toLocaleString()}</dd>
    </div>
    <div>
      <dt>Output</dt>
      <dd>{usage.output.toLocaleString()}</dd>
    </div>
    <div>
      <dt>Cache read</dt>
      <dd>{usage.cacheRead.toLocaleString()}</dd>
    </div>
    <div>
      <dt>Cache write</dt>
      <dd>{usage.cacheWrite.toLocaleString()}</dd>
    </div>
  </dl>
  {#if usage.costIncomplete}<p>
      Some tokens have no reported price. The estimate includes only known
      costs.
    </p>{/if}
{/if}

<style>
  .usage {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .usage.compact {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    font-size: 10px;
    white-space: nowrap;
  }
  .compact > span {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    margin: 12px 0;
    font-size: 12px;
  }
  dt,
  p {
    color: var(--muted);
    font-size: 11px;
  }
  dd {
    margin: 4px 0 0;
    font-variant-numeric: tabular-nums;
  }
</style>
