<script lang="ts">
  import { onMount } from "svelte";
  import {
    oppositeTheme,
    resolveTheme,
    THEME_STORAGE_KEY,
    type Theme,
  } from "$lib/theme.ts";

  let theme = $state<Theme>("light");

  onMount(() => {
    theme = resolveTheme(
      localStorage.getItem(THEME_STORAGE_KEY),
      matchMedia("(prefers-color-scheme: dark)").matches,
    );
    document.documentElement.dataset.theme = theme;
  });

  function toggle() {
    theme = oppositeTheme(theme);
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
</script>

<button
  class="theme-toggle"
  onclick={toggle}
  aria-label={`Switch to ${oppositeTheme(theme)} mode`}
  title={`Switch to ${oppositeTheme(theme)} mode`}
>
  <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
  <span class="label">{theme === "dark" ? "Light" : "Dark"}</span>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .theme-toggle:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .theme-toggle span:first-child {
    font-size: 15px;
    line-height: 1;
  }
  @media (max-width: 700px) {
    .label {
      display: none;
    }
  }
</style>
