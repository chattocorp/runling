import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  ssr: { external: ["factory"] },
  // Config files import Factory through Bun. Keep one runtime instance.
  build: { rollupOptions: { external: ["factory"] } },
});
