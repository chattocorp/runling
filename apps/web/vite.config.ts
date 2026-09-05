import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  ssr: { external: ["factory"] },
  // Config files and the server must share one Factory event runtime.
  build: { rollupOptions: { external: ["factory", "factory/web"] } },
});
