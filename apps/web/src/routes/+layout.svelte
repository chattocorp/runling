<script lang="ts">
  import "@fontsource-variable/plus-jakarta-sans/wght.css";
  import "@fontsource-variable/plus-jakarta-sans/wght-italic.css";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}

<style>
  :global(:root) {
    font-family: "Plus Jakarta Sans Variable", "Segoe UI", sans-serif;
  }
</style>
