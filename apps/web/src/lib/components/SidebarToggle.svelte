<script lang="ts">
  let { expanded, onclick }: { expanded: boolean; onclick: () => void } = $props();
  let label = $derived(expanded ? "Collapse sidebars" : "Expand sidebars");
</script>

<button
  type="button"
  {onclick}
  aria-label={label}
  title={`${label} (Cmd/Ctrl+B)`}
  aria-keyshortcuts="Meta+b Control+b"
  aria-expanded={expanded}
  aria-controls="webhook-sidebar runs-sidebar"
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
    <path d={expanded ? "m16 9-3 3 3 3" : "m13 9 3 3-3 3"} />
  </svg>
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-raised);
    color: var(--ink);
  }
  button:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 3px;
  }
  svg {
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
