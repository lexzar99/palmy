import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      injectManifest: {
        // App-shellen är liten; precachea statiska assets.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
      devOptions: { enabled: false, type: "module" },
      manifest: {
        name: "ViaEats Kurir",
        short_name: "ViaEats",
        description: "Leverera ordrar med ViaEats",
        lang: "sv",
        theme_color: "#0C0B0C",
        background_color: "#0C0B0C",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
    }),
  ],
  server: { port: 5180 },
});
