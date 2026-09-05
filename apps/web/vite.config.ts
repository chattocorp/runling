import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  ssr: { external: ["runling"] },
  // Config files and the server must share one Runling event runtime.
  build: {
    rollupOptions: {
      external: ["runling", "runling/web", "runling/config-reloader"],
    },
  },
});
