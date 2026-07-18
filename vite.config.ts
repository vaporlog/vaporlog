import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  // Absolute asset base: with './', deep-link reloads (e.g. /strains/og-kush)
  // resolve ./assets/... relative to the route path, so the SPA fallback serves
  // index.html instead of JS and the page goes blank. The GitHub Pages build
  // overrides this via `vite build --base=/vaporlog/` (see build:pages).
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    proxy: {
      // Dev: same-origin /api calls are forwarded to the local API
      // (mirrors the nginx /api → api:4000 proxy used in production).
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
