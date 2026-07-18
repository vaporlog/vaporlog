/**
 * vaporlog API — dynamic OG card renderer for public sessions.
 *
 *   GET /api/og/s/:id/card.png  (open) → image/png, 1200×630
 *
 * Renders a per-session Open Graph image on the fly: strain, rating, ritual
 * (device · temperature · duration) and author handle over the brand's black
 * background with the #74C69D accent. The SVG template is rasterized with
 * @resvg/resvg-js using the DejaVu fonts committed under assets/fonts/ — no
 * system fonts or apk packages needed, so it renders identically on Windows
 * dev boxes and the Alpine production container.
 *
 * Privacy contract matches og.js: only public sessions get a card. Private
 * or unknown ids — and any render failure — get a 302 to the static brand
 * image, so crawlers always land on a valid image and nothing leaks.
 *
 * Rendered cards are cached in a bounded in-memory Map keyed by the session
 * content itself (the table has no updated_at), so an edit changes the key
 * and stale cards age out naturally.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { pool } from "../db.js";
import { humanizeSlug } from "./og.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_IMAGE = "/brand/og-default.jpg";
const WIDTH = 1200;
const HEIGHT = 630;
const ACCENT = "#74C69D";
const GRAY = "#9BA3A0";

const serverRoot = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);
const FONT_DIR = path.join(serverRoot, "assets", "fonts");
const FONT_FILES = [
  path.join(FONT_DIR, "DejaVuSans.ttf"),
  path.join(FONT_DIR, "DejaVuSans-Bold.ttf"),
];

/** Mascot embedded as a data URI — read once; the card falls back to
 *  text-only if the asset is ever missing. */
let mascotDataUri = null;
try {
  const png = fs.readFileSync(path.join(serverRoot, "assets", "mascot.png"));
  mascotDataUri = `data:image/png;base64,${png.toString("base64")}`;
} catch {
  mascotDataUri = null;
}

/** XML-escape interpolated text (strain/device names can contain & < >). */
function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** "195.0" → "195", "195.5" → "195.5" (pg returns numerics as strings). */
function fmtNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Rough width estimate for DejaVu Sans Bold (~0.58 em average across the
 * mixed-case Latin text these cards carry) — good enough to pick a font
 * size and wrap point without a shaping engine.
 */
function fitsOneLine(text, fontSize, maxWidth) {
  return text.length * fontSize * 0.58 <= maxWidth;
}

/** Split text into two lines at a word boundary near the middle. */
function wrapTwoLines(text, fontSize, maxWidth) {
  const words = text.split(" ");
  const lines = ["", ""];
  for (const word of words) {
    const target =
      lines[0] === "" ||
      (!fitsOneLine(`${lines[0]} ${word}`.trim(), fontSize, maxWidth) &&
        lines[1] === "")
        ? 1
        : 0;
    lines[target] = lines[target] === "" ? word : `${lines[target]} ${word}`;
    if (target === 0 && !fitsOneLine(lines[0], fontSize, maxWidth)) {
      // move the overflowing word to line 2
      const cut = lines[0].lastIndexOf(" ");
      lines[1] = lines[0].slice(cut + 1) + (lines[1] ? ` ${lines[1]}` : "");
      lines[0] = lines[0].slice(0, cut);
    }
  }
  return lines.filter(Boolean);
}

/**
 * Picks the largest bold size that renders the strain within MAX_WIDTH in
 * at most two lines; the last resort truncates with an ellipsis.
 */
function layoutStrain(name) {
  const MAX_WIDTH = 1040;
  for (const size of [92, 78, 66, 56]) {
    if (fitsOneLine(name, size, MAX_WIDTH)) {
      return { lines: [name], size };
    }
    const lines = wrapTwoLines(name, size, MAX_WIDTH);
    if (
      lines.length <= 2 &&
      lines.every((line) => fitsOneLine(line, size, MAX_WIDTH))
    ) {
      return { lines, size };
    }
  }
  // Extremely long name: hard-truncate to something that fits at 48px.
  let clipped = name;
  while (clipped.length > 1 && !fitsOneLine(`${clipped}…`, 48, MAX_WIDTH)) {
    clipped = clipped.slice(0, -1);
  }
  return { lines: [`${clipped.trimEnd()}…`], size: 48 };
}

function buildCardSvg(session) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");

  const ritual = [
    device,
    fmtNumber(session.temperature_c) !== null
      ? `${fmtNumber(session.temperature_c)}°C`
      : null,
    fmtNumber(session.duration_min) !== null
      ? `${fmtNumber(session.duration_min)} min`
      : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const { lines, size } = layoutStrain(strain);
  const lineHeight = size * 1.12;
  // Vertically center the strain block between the header and the footer.
  const blockTop = lines.length === 1 ? 250 : 205;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${blockTop + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const ratingY = blockTop + (lines.length - 1) * lineHeight + 86;

  const mascot = mascotDataUri
    ? `<image href="${mascotDataUri}" x="930" y="368" width="210" height="210" />`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="18%" cy="88%" r="75%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16" />
      <stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.04" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#000000" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />
  <rect x="0" y="0" width="10" height="${HEIGHT}" fill="${ACCENT}" />
  <text x="80" y="106" font-family="DejaVu Sans" font-weight="bold" font-size="42"><tspan fill="#FFFFFF">vapor</tspan><tspan fill="${ACCENT}">log</tspan></text>
  <text x="1120" y="100" text-anchor="end" font-family="DejaVu Sans" font-size="32" fill="${GRAY}">@${esc(author)}</text>
  ${strainTspans}
  <text x="80" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="58" fill="${ACCENT}">${rating.toFixed(1)}/10</text>
  ${ritual ? `<text x="80" y="548" font-family="DejaVu Sans" font-size="36" fill="${GRAY}">${esc(ritual)}</text>` : ""}
  ${mascot}
</svg>`;
}

/** Bounded LRU-ish card cache (oldest key evicted past MAX_ENTRIES). */
const MAX_ENTRIES = 200;
const cardCache = new Map();

export default async function ogImageRoutes(app) {
  app.get("/api/og/s/:id/card.png", async (request, reply) => {
    const { id } = request.params;
    if (!UUID_RE.test(id)) {
      return reply.redirect(FALLBACK_IMAGE, 302);
    }

    const { rows } = await pool.query(
      `select s.strain_slug, s.device_slug, s.temperature_c,
              s.duration_min, s.rating, s.author,
              p.handle as owner_handle,
              d.name   as device_name
         from sessions s
         left join profiles p on p.id = s.user_id
         left join devices  d on d.slug = s.device_slug
        where s.id = $1 and s.is_public`,
      [id],
    );
    if (rows.length === 0) {
      // Private or unknown id: never confirm existence — same fallback both ways.
      return reply.redirect(FALLBACK_IMAGE, 302);
    }

    try {
      const session = rows[0];
      // sessions has no updated_at; the rendered content itself is the key,
      // so editing the session changes the key and invalidates naturally.
      const cacheKey = `${id}:${JSON.stringify(session)}`;
      let png = cardCache.get(cacheKey);
      if (png === undefined) {
        const resvg = new Resvg(buildCardSvg(session), {
          fitTo: { mode: "width", value: WIDTH },
          font: { fontFiles: FONT_FILES, loadSystemFonts: false },
          background: "#000000",
        });
        png = Buffer.from(resvg.render().asPng());
        if (cardCache.size >= MAX_ENTRIES) {
          cardCache.delete(cardCache.keys().next().value);
        }
        cardCache.set(cacheKey, png);
      }
      return reply
        .type("image/png")
        .header("cache-control", "public, max-age=300")
        .send(png);
    } catch (error) {
      // A broken card must never 500 a crawler — fall back to the static image.
      request.log.error(error, "og card render failed");
      return reply.redirect(FALLBACK_IMAGE, 302);
    }
  });
}
