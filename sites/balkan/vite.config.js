import { resolve } from "node:path";
import { defineConfig } from "vite";

// Två sidor: hemsidan och TV-menyn vid kassan (/tv/)
export default defineConfig({
  root: import.meta.dirname,
  publicDir: "public",
  build: {
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), tv: resolve(import.meta.dirname, "tv/index.html") } },
  },
});
