<script lang="ts">
  import { onMount } from "svelte";
  let preference = $state("system");
  let ready = $state(false);
  let update = () => {};

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      try {
        return localStorage.getItem("factory-theme");
      } catch {
        return null;
      }
    };
    const sync = () => {
      const saved = read();
      preference = saved === "light" || saved === "dark" ? saved : "system";
      apply();
    };
    const apply = () => {
      document.documentElement.dataset.theme =
        preference === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preference;
    };
    update = () => {
      try {
        localStorage.setItem("factory-theme", preference);
      } catch {
        /* Session-only preference. */
      }
      apply();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "factory-theme" || event.key === null) sync();
    };
    sync();
    ready = true;
    media.addEventListener("change", apply);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", storage);
    };
  });
</script>

<label>
  <span>Theme</span>
  <select
    aria-label="Color theme"
    disabled={!ready}
    bind:value={preference}
    onchange={() => update()}
  >
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
</label>

<style>
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
  }
  select {
    font: inherit;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px;
  }
  @media (max-width: 700px) {
    label > span {
      display: none;
    }
  }
</style>
