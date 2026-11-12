import { defineConfig } from "vite";

export default defineConfig({ root: import.meta.dirname, publicDir: "public", build: { assetsInlineLimit: 0 } });
