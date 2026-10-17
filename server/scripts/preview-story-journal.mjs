/**
 * Offline preview: renders the story-journal OG card with a mock session so
 * layout changes can be eyeballed without booting the API.
 *
 *   node scripts/preview-story-journal.mjs [lang]
 *
 * Defaults to English; pass "es" as the last argument for the Spanish card
 * copy. PNGs land in /tmp/vaporlog-og-story-journal[-es].png.
 */
import fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCardSvg } from "../src/routes/og-image.js";

const serverRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);
const FONT_FILES = [
  path.join(serverRoot, "assets", "fonts", "DejaVuSans.ttf"),
  path.join(serverRoot, "assets", "fonts", "DejaVuSans-Bold.ttf"),
];

const mockSession = {
  strain_slug: "blue-dream",
  rating: 8.5,
  author: "enri",
  owner_handle: "enri",
  device_name: "Volcano Hybrid",
  device_slug: "volcano-hybrid",
  temperature_c: 195,
  duration_min: 12,
  amount_g: 0.3,
  liked: true,
  moods: ["relajado", "eufórico", "creativo", "concentrado"],
  aromas: ["cítrico", "pino", "tierra"],
  flavors: ["dulce", "limón", "especias"],
  effect_intensities: { relajado: 8, eufórico: 7, creativo: 6, concentrado: 5 },
  unwanted_effects: ["boca seca"],
  unwanted_effects_public: true,
  activities: ["leer", "música"],
  activities_public: true,
  energy_calm_score: -2,
  notes:
    "Sesión tranquila después del trabajo. Sabor suave, sin tos. Repetiría a 190°C.",
  created_at: "2026-10-11T21:30:00Z",
};

const args = process.argv.slice(2);
const lang = ["es", "en"].includes(args[args.length - 1]) ? args.pop() : "en";

const resvg = new Resvg(
  buildCardSvg(mockSession, "story-journal", { includeAllEffects: true, lang }),
  {
    fitTo: { mode: "width", value: 1080 },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false },
    background: "#000000",
  },
);
const out = `/tmp/vaporlog-og-story-journal${lang === "en" ? "" : `-${lang}`}.png`;
fs.writeFileSync(out, resvg.render().asPng());
console.log(out);

// Importing og-image.js boots the embedded dev DB (PGlite), which keeps the
// event loop alive — exit explicitly once the render is done.
process.exit(0);
