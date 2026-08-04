/**
 * vaporlog API — dynamic OG card renderer for public sessions.
 *
 *   GET /api/og/s/:id/card.png  (open) → image/png, 1200×630
 *     ?t=split|minimal|stats picks the card design (default: split);
 *     unknown values fall back to split. The share UI appends the choice
 *     to the shared /s/:id link and og.js forwards it into og:image.
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
import { humanizeSlug, normalizeTemplate } from "./og.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_IMAGE = "/brand/og-default.jpg";
const WIDTH = 1200;
const HEIGHT = 630;
const ACCENT = "#74C69D";
const GRAY = "#9BA3A0";
const PANEL = "#0E2418";

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

/** "195.0" → "195", "195.5" → "195.5" (pg returns numerics as strings).
 *  Missing values stay missing — null never becomes "0°C". */
function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return null;
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
 * Picks the largest bold size that renders the strain within `textWidth`
 * in at most two lines; the last resort truncates with an ellipsis.
 * The split template uses the narrow default (620px); edge-to-edge
 * templates pass a wider width and larger sizes.
 */
function layoutStrain(
  name,
  textWidth = 620,
  sizes = [84, 72, 62, 52],
  fallbackSize = 46,
) {
  for (const size of sizes) {
    if (fitsOneLine(name, size, textWidth)) {
      return { lines: [name], size };
    }
    const lines = wrapTwoLines(name, size, textWidth);
    if (
      lines.length <= 2 &&
      lines.every((line) => fitsOneLine(line, size, textWidth))
    ) {
      return { lines, size };
    }
  }
  // Extremely long name: hard-truncate to something that fits.
  let clipped = name;
  while (
    clipped.length > 1 &&
    !fitsOneLine(`${clipped}…`, fallbackSize, textWidth)
  ) {
    clipped = clipped.slice(0, -1);
  }
  return { lines: [`${clipped.trimEnd()}` + "…"], size: fallbackSize };
}

/** Shared header/footer pieces so every template stays on-brand. */
function wordmarkSvg(x, y, size) {
  return `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}"><tspan fill="#FFFFFF">vapor</tspan><tspan fill="${ACCENT}">log</tspan></text>`;
}

/** Truncates text with an ellipsis until it fits `maxWidth` at `fontSize`. */
function fitLine(text, fontSize, maxWidth) {
  const original = String(text);
  let out = original;
  while (out.length > 1 && !fitsOneLine(`${out}…`, fontSize, maxWidth)) {
    out = out.slice(0, -1);
  }
  return out === original ? out : `${out.trimEnd()}…`;
}

/** "@handle" clipped to fit `maxWidth` at `fontSize` (ellipsis appended). */
function fitAuthor(author, fontSize, maxWidth) {
  return fitLine(`@${author}`, fontSize, maxWidth);
}

/** Black background + the brand glow, common to all three templates. */
function backdropSvg() {
  return `<rect width="${WIDTH}" height="${HEIGHT}" fill="#000000" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />`;
}

const GLOW_DEFS = `<defs>
    <radialGradient id="glow" cx="18%" cy="88%" r="75%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16" />
      <stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.04" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>`;

function buildSplitSvg(session) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");

  const ritualRest = [
    fmtNumber(session.temperature_c) !== null
      ? `${fmtNumber(session.temperature_c)}°C`
      : null,
    fmtNumber(session.duration_min) !== null
      ? `${fmtNumber(session.duration_min)} min`
      : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  // Keep the author handle inside the 460px brand panel.
  let authorLabel = `@${author}`;
  while (
    authorLabel.length > 2 &&
    !fitsOneLine(authorLabel, 34, 420)
  ) {
    authorLabel = `${authorLabel.slice(0, -2)}`;
  }
  if (authorLabel !== `@${author}`) authorLabel = `${authorLabel}…`;

  const { lines, size } = layoutStrain(strain);
  const lineHeight = size * 1.12;
  // Left panel vertical rhythm: wordmark → strain → rating → ritual → chips.
  const strainY0 = lines.length === 1 ? 235 : 198;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const ratingY = strainY0 + (lines.length - 1) * lineHeight + 95;
  const ritualY = ratingY + 68;

  // Mood chips: outlined pills under the ritual line; any chip that would
  // cross into the brand panel (x > 700) is simply not drawn.
  const moods = Array.isArray(session.moods) ? session.moods : [];
  const hasRitual = device !== "" || ritualRest !== "";
  const chipsTop = (hasRitual ? ritualY : ratingY) + 42;
  let chipX = 80;
  const chipSvgs = [];
  for (const mood of moods.slice(0, 4)) {
    const label = String(mood);
    const chipW = Math.ceil(label.length * 26 * 0.58) + 44;
    if (chipX + chipW > 700) break;
    chipSvgs.push(
      `<rect x="${chipX}" y="${chipsTop}" width="${chipW}" height="52" rx="26" fill="none" stroke="${ACCENT}" stroke-width="2" />`,
      `<text x="${chipX + 22}" y="${chipsTop + 33}" font-family="DejaVu Sans" font-size="26" fill="${ACCENT}">${esc(label)}</text>`,
    );
    chipX += chipW + 18;
  }

  const mascot = mascotDataUri
    ? `<image href="${mascotDataUri}" x="805" y="100" width="330" height="330" />`
    : "";

  const likedSuffix = session.liked === true ? " — liked" : "";

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
  <rect x="740" y="0" width="${WIDTH - 740}" height="${HEIGHT}" fill="${PANEL}" />
  <rect x="0" y="0" width="10" height="${HEIGHT}" fill="${ACCENT}" />
  <rect x="740" y="0" width="3" height="${HEIGHT}" fill="${ACCENT}" />
  <text x="80" y="100" font-family="DejaVu Sans" font-weight="bold" font-size="42"><tspan fill="#FFFFFF">vapor</tspan><tspan fill="${ACCENT}">log</tspan></text>
  ${strainTspans}
  <text x="80" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="60" fill="${ACCENT}">${rating.toFixed(1)}/10${esc(likedSuffix)}</text>
  ${hasRitual ? `<text x="80" y="${ritualY}" font-family="DejaVu Sans" font-size="32"><tspan fill="#FFFFFF">${esc(device)}</tspan>${ritualRest ? `<tspan fill="${GRAY}">  ·  ${esc(ritualRest)}</tspan>` : ""}</text>` : ""}
  ${chipSvgs.join("\n  ")}
  <text x="80" y="578" font-family="DejaVu Sans" font-size="22" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
  ${mascot}
  <text x="970" y="480" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="34" fill="#FFFFFF">${esc(authorLabel)}</text>
  <text x="970" y="530" text-anchor="middle" font-family="DejaVu Sans" font-size="26" fill="${GRAY}">vaporized this</text>
</svg>`;
}

/**
 * Template "minimal": typography only. The strain carries the whole card
 * edge-to-edge, rating as the single accent, no mascot, no panels.
 */
function buildMinimalSvg(session) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");

  const details = [
    fmtNumber(session.temperature_c) !== null
      ? `${fmtNumber(session.temperature_c)}°C`
      : null,
    fmtNumber(session.duration_min) !== null
      ? `${fmtNumber(session.duration_min)} min`
      : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const { lines, size } = layoutStrain(strain, 1040, [84, 72, 62, 52], 46);
  const lineHeight = size * 1.12;
  const strainY0 = lines.length === 1 ? 300 : 246;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const ratingY = strainY0 + (lines.length - 1) * lineHeight + 108;
  const deviceY = ratingY + 58;
  const detailY = deviceY + 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${GLOW_DEFS}
  ${backdropSvg()}
  <rect x="0" y="0" width="10" height="${HEIGHT}" fill="${ACCENT}" />
  ${wordmarkSvg(80, 106, 40)}
  ${strainTspans}
  <text x="80" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="66" fill="${ACCENT}">${rating.toFixed(1)}/10</text>
  <text x="80" y="${deviceY}" font-family="DejaVu Sans" font-size="34" fill="#FFFFFF">${esc(fitLine(device, 34, 1040))}</text>
  ${details ? `<text x="80" y="${detailY}" font-family="DejaVu Sans" font-size="28" fill="${GRAY}">${esc(details)}</text>` : ""}
  <text x="80" y="578" font-family="DejaVu Sans" font-size="24" fill="${GRAY}">${esc(fitAuthor(author, 24, 500))}</text>
  <text x="1120" y="578" text-anchor="end" font-family="DejaVu Sans" font-size="22" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

/**
 * Template "stats": the session as a dashboard — strain header plus three
 * big number panels (rating, temperature, duration). Missing values show
 * an em dash rather than a fake zero.
 */
function buildStatsSvg(session) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");
  const temp = fmtNumber(session.temperature_c);
  const duration = fmtNumber(session.duration_min);

  const { lines, size } = layoutStrain(strain, 1040, [56, 48, 44], 40);
  const lineHeight = size * 1.12;
  const strainY0 = lines.length === 1 ? 200 : 178;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const deviceY = strainY0 + (lines.length - 1) * lineHeight + 44;

  // Three panels, 80..1120 with 16px gutters.
  const panels = [
    {
      value: `${rating.toFixed(1)}`,
      suffix: "/10",
      label: "rating",
      accent: true,
    },
    {
      value: temp !== null ? `${temp}°C` : "—",
      suffix: "",
      label: "temperature",
      accent: false,
    },
    {
      value: duration !== null ? duration : "—",
      suffix: duration !== null ? " min" : "",
      label: "duration",
      accent: false,
    },
  ];
  const panelSvgs = panels
    .map((panel, i) => {
      const x = 80 + i * (336 + 16);
      const cx = x + 168;
      return `<rect x="${x}" y="310" width="336" height="200" rx="20" fill="${PANEL}" />
  <text x="${cx}" y="422" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="72" fill="${panel.accent ? ACCENT : "#FFFFFF"}">${esc(panel.value)}<tspan font-size="30" fill="${GRAY}">${esc(panel.suffix)}</tspan></text>
  <text x="${cx}" y="472" text-anchor="middle" font-family="DejaVu Sans" font-size="24" fill="${GRAY}">${panel.label}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${GLOW_DEFS}
  ${backdropSvg()}
  <rect x="0" y="0" width="10" height="${HEIGHT}" fill="${ACCENT}" />
  ${wordmarkSvg(80, 96, 38)}
  <text x="1120" y="96" text-anchor="end" font-family="DejaVu Sans" font-size="26" fill="${GRAY}">${esc(fitAuthor(author, 26, 420))}</text>
  ${strainTspans}
  <text x="80" y="${deviceY}" font-family="DejaVu Sans" font-size="30" fill="#C9CFCB">${esc(fitLine(device, 30, 1040))}</text>
  ${panelSvgs}
  <text x="80" y="578" font-family="DejaVu Sans" font-size="22" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

const TEMPLATE_BUILDERS = {
  split: buildSplitSvg,
  minimal: buildMinimalSvg,
  stats: buildStatsSvg,
};

/** Renders one session card in the requested template (validated caller-side). */
function buildCardSvg(session, template = "split") {
  return (TEMPLATE_BUILDERS[template] ?? buildSplitSvg)(session);
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
              s.duration_min, s.rating, s.author, s.liked, s.moods,
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
      // The share UI picks the card design via ?t= (see OG_TEMPLATES in
      // og.js); unknown values fall back to the default split layout.
      const template = normalizeTemplate(request.query?.t);
      // sessions has no updated_at; the rendered content itself is the key,
      // so editing the session changes the key and invalidates naturally.
      const cacheKey = `${id}:${template}:${JSON.stringify(session)}`;
      let png = cardCache.get(cacheKey);
      if (png === undefined) {
        const resvg = new Resvg(buildCardSvg(session, template), {
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

// Named export for offline render tests (scripts, previews) — the Fastify
// plugin above stays the default export and the only thing the app registers.
export { buildCardSvg };
