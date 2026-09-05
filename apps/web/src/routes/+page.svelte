<svelte:head>
  <title>Factory webhooks</title>
  <meta
    name="description"
    content="Schemaful webhooks for Factory workflows."
  />
</svelte:head>

<main>
  <p class="eyebrow">Factory</p>
  <h1>Workflows on demand.</h1>
  <p class="summary">
    Send JSON to <code>/api/webhooks/joke</code>. The app validates the request,
    runs the joke workflow, and logs its output.
  </p>

  <pre><code>curl -X POST http://localhost:5173/api/webhooks/joke \
  -H 'content-type: application/json' \
  -d {'\'{"value":"monorepos"}\''}</code></pre>

  <p class="hint">
    Send a <code>GET</code> request to the same URL to inspect the body, workflow
    input, and workflow output schemas.
  </p>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: #f3f0e8;
    color: #172118;
    font-family: Georgia, "Times New Roman", serif;
  }

  main {
    width: min(42rem, calc(100% - 3rem));
    margin: 16vh auto 0;
  }

  .eyebrow {
    margin: 0 0 1rem;
    color: #526c47;
    font: 700 0.75rem/1 system-ui, sans-serif;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 9ch;
    margin: 0;
    font-size: clamp(3.5rem, 11vw, 7rem);
    font-weight: 400;
    letter-spacing: -0.07em;
    line-height: 0.88;
  }

  .summary {
    max-width: 35rem;
    margin: 2rem 0;
    font: 1.1rem/1.6 system-ui, sans-serif;
  }

  .hint {
    max-width: 35rem;
    color: #526052;
    font: 0.9rem/1.6 system-ui, sans-serif;
  }

  code {
    font-family: "SFMono-Regular", Consolas, monospace;
  }

  pre {
    overflow-x: auto;
    padding: 1.25rem;
    border: 1px solid #b8b4a7;
    border-radius: 0.5rem;
    background: #e8e4da;
    font-size: 0.85rem;
    line-height: 1.6;
  }
</style>
