import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// VITE_BASE lets the same build be served from a sub-path (GitHub Pages: "/repo-name/").
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Arah",
        short_name: "Arah",
        description: "Privacy-first, open-source navigation for Malaysia.",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the app shell and our own static datasets. Map tiles, routing and
        // search calls always go to the network (never cached from here).
        globPatterns: ["**/*.{js,mjs,css,html,png,svg,json,webmanifest}"],
        // The map-data tiles (thousands of small files) are cached as they are used instead.
        globIgnores: ["data/osm/**"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes("/data/osm/"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "osm-data", expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
