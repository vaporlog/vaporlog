/**
 * GitHub Pages SPA fallback: Pages serves 404.html for any path with no
 * matching static file, so copying the built index.html to 404.html lets
 * react-router resolve deep links (e.g. /vaporlog/strains/…) client-side
 * instead of showing the default Pages 404.
 */
import { copyFile } from "node:fs/promises";

const indexHtml = new URL("../dist/index.html", import.meta.url);
const fallbackHtml = new URL("../dist/404.html", import.meta.url);

await copyFile(indexHtml, fallbackHtml);
console.log("Wrote dist/404.html (GitHub Pages SPA fallback).");
