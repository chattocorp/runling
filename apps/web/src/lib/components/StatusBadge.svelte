<script lang="ts">
  let { status }: { status: string } = $props();
</script>

<span
  class="status"
  class:live={status === "running"}
  class:bad={status === "failed" || status === "blocked"}
  class:good={status === "completed"}
>
  <span class="dot"></span>{status}
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .live {
    color: var(--blue);
  }
  .good {
    color: var(--green);
  }
  .bad {
    color: var(--red);
  }
  .live .dot {
    animation: pulse 1.7s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
      box-shadow: 0 0 0 4px #527de421;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live .dot {
      animation: none;
    }
  }
</style>
