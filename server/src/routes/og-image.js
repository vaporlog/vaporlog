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

/**
 * Tiny effect chart for the split card. Three or more effects render as a
 * spider/radar; one or two render as vertical bars, which read clearer at
 * thumbnail size. Moods in the brand accent, unwanted effects in red. No
 * text labels on the radar — the silhouette is the signal.
 *
 * `colors` overrides the palette for light-background templates (journal).
 */
function buildEffectChartSvg(
  intensities,
  unwantedEffects,
  cx,
  cy,
  radius,
  colors = {},
) {
  const {
    grid: gridColor = GRAY,
    axis = GRAY,
    herb = ACCENT,
    red = "#E11D48",
    label = GRAY,
    track = PANEL,
  } = colors;
  const entries = Object.entries(intensities);
  if (entries.length === 0) return "";

  const unwanted = new Set(unwantedEffects);

  // 1-2 effects: horizontal bars, same slice style as the energy/calm bar.
  // Centered in the brand panel, each bar reads label + 0-10 marker.
  if (entries.length < 3) {
    const barWidth = 260;
    const barHeight = 18;
    const rowHeight = 72;
    const startX = cx - barWidth / 2;
    const startY = cy - ((entries.length - 1) * rowHeight) / 2;
    const bars = entries
      .map(([tag, intensity], i) => {
        const value = Math.min(Math.max(Number(intensity) || 0, 0), 10);
        const y = startY + i * rowHeight;
        const markerX = startX + (value / 10) * barWidth;
        const color = unwanted.has(tag) ? red : herb;
        return [
          `<text x="${startX}" y="${y - 12}" font-family="DejaVu Sans" font-size="20" fill="${label}">${esc(fitLine(tag, 20, 140))}</text>`,
          `<rect x="${startX}" y="${y}" width="${barWidth}" height="${barHeight}" rx="9" fill="${track}" stroke="${axis}" stroke-width="1" />`,
          `<rect x="${markerX - 4}" y="${y - 4}" width="8" height="${barHeight + 8}" rx="4" fill="${color}" />`,
          `<text x="${startX + barWidth + 16}" y="${y + 16}" font-family="DejaVu Sans" font-weight="bold" font-size="22" fill="${color}">${value}</text>`,
        ].join("");
      })
      .join("");
    return bars;
  }

  // 3+ effects: radar with labels.
  const n = entries.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2; // first axis points up
  const chartRadius = radius * 0.72; // leave room for labels
  const labelRadius = radius * 0.92;

  // Grid: concentric regular polygons at 2/4/6/8/10.
  const grid = [2, 4, 6, 8, 10]
    .map((level) => {
      const r = (level / 10) * chartRadius;
      const points = [];
      for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `<polygon points="${points.join(" ")}" fill="none" stroke="${gridColor}" stroke-width="1" opacity="0.35" />`;
    })
    .join("");

  // Axis lines.
  const axes = entries
    .map((_, i) => {
      const angle = startAngle + i * angleStep;
      const x = cx + chartRadius * Math.cos(angle);
      const y = cy + chartRadius * Math.sin(angle);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${axis}" stroke-width="1" opacity="0.45" />`;
    })
    .join("");

  // Data polygon.
  const dataPoints = entries.map(([tag, intensity], i) => {
    const angle = startAngle + i * angleStep;
    const r = (Math.min(Math.max(Number(intensity) || 0, 0), 10) / 10) * chartRadius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      isUnwanted: unwanted.has(tag),
    };
  });
  const polygon = `<polygon points="${dataPoints.map((p) => `${p.x},${p.y}`).join(" ")}" fill="${herb}" fill-opacity="0.22" stroke="${herb}" stroke-width="2" />`;
  const dots = dataPoints
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.isUnwanted ? red : herb}" />`,
    )
    .join("");

  // Effect labels around the rim.
  const labels = entries
    .map(([tag], i) => {
      const angle = startAngle + i * angleStep;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = cx + labelRadius * cos;
      let y = cy + labelRadius * sin;
      if (sin > 0.3) y += 14;
      else if (sin < -0.3) y -= 6;
      const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      const color = unwanted.has(tag) ? red : label;
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="DejaVu Sans" font-size="18" fill="${color}">${esc(fitLine(tag, 18, 140))}</text>`;
    })
    .join("");

  return `${grid}${axes}${polygon}${dots}${labels}`;
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

function buildSplitSvg(session, options = {}) {
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

  // Effect radar on the brand panel: mood intensities are public; unwanted
  // ones only when the author opted in. With too few axes the panel falls
  // back to the mascot.
  const rawIntensities =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const unwantedPublic = options.includeAllEffects === true || session.unwanted_effects_public === true;
  const publicIntensities = Object.fromEntries(
    Object.entries(rawIntensities).filter(([tag]) => {
      if (moods.includes(tag)) return true;
      return unwantedPublic && Array.isArray(session.unwanted_effects)
        ? session.unwanted_effects.includes(tag)
        : false;
    }),
  );
  const radar = buildEffectChartSvg(
    publicIntensities,
    unwantedPublic ? session.unwanted_effects ?? [] : [],
    970,
    270,
    150,
  );
  const showRadar = radar !== "";
  const mascot = !showRadar && mascotDataUri
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
  ${radar}
  <text x="970" y="480" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="34" fill="#FFFFFF">${esc(authorLabel)}</text>
  <text x="970" y="530" text-anchor="middle" font-family="DejaVu Sans" font-size="26" fill="${GRAY}">vaporized this</text>
</svg>`;
}

/**
 * Template "minimal": typography only. The strain carries the whole card
 * edge-to-edge, rating as the single accent, no mascot, no panels.
 */
function buildMinimalSvg(session, options = {}) {
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
function buildStatsSvg(session, options = {}) {
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

/* ------------------------------------------------------------------------ */
/* Vertical story templates (1080×1920) — for download / TikTok / Reels.     */
/* ------------------------------------------------------------------------ */

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function storyBackdrop() {
  return `<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="#000000" />
  <rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#glow)" />`;
}

const STORY_GLOW_DEFS = `<defs>
    <radialGradient id="glow" cx="50%" cy="100%" r="90%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.18" />
      <stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>`;

/**
 * Template "story": vertical split. Strain top, rating, ritual, aroma/flavor
 * chips, effect chart (moods/unwanted effects live there — no duplicate
 * chips), author bottom.
 */
function buildStorySvg(session, options = {}) {
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

  const { lines, size } = layoutStrain(strain, 920, [96, 84, 72, 60], 52);
  const lineHeight = size * 1.12;
  const strainY0 = lines.length === 1 ? 300 : 250;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const ratingY = strainY0 + (lines.length - 1) * lineHeight + 120;
  const ritualY = ratingY + 78;

  // Aroma and flavor chips — two separate rows so each group reads on its
  // own. Moods already show up as radar labels, so repeating them as chips
  // would duplicate information.
  const aromas = Array.isArray(session.aromas) ? session.aromas : [];
  const flavors = Array.isArray(session.flavors) ? session.flavors : [];
  const chipRows = [
    { label: "Aromas", values: aromas },
    { label: "Sabores", values: flavors },
  ];
  const chipSvgs = [];
  let chipRowY = ritualY + 56;
  for (const row of chipRows) {
    if (row.values.length === 0) continue;
    let chipX = 80;
    for (const note of row.values.slice(0, 4)) {
      const label = String(note);
      const chipW = Math.ceil(label.length * 30 * 0.58) + 52;
      if (chipX + chipW > 1000) break;
      chipSvgs.push(
        `<rect x="${chipX}" y="${chipRowY}" width="${chipW}" height="64" rx="32" fill="none" stroke="${GRAY}" stroke-width="2" />`,
        `<text x="${chipX + 26}" y="${chipRowY + 41}" font-family="DejaVu Sans" font-size="30" fill="${GRAY}">${esc(label)}</text>`,
      );
      chipX += chipW + 22;
    }
    chipRowY += 84;
  }

  // Effect chart: reuse the same radar/bars logic, centered and larger to
  // fill the vertical space.
  const rawIntensities =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const unwantedPublic = options.includeAllEffects === true || session.unwanted_effects_public === true;
  const publicIntensities = Object.fromEntries(
    Object.entries(rawIntensities).filter(([tag]) => {
      if (Array.isArray(session.moods) && session.moods.includes(tag)) return true;
      return unwantedPublic && Array.isArray(session.unwanted_effects)
        ? session.unwanted_effects.includes(tag)
        : false;
    }),
  );
  const chart = buildEffectChartSvg(
    publicIntensities,
    unwantedPublic ? session.unwanted_effects ?? [] : [],
    STORY_WIDTH / 2,
    1120,
    300,
  );

  const authorLabel = fitAuthor(author, 38, 800);
  const likedSuffix = session.liked === true ? " — liked" : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  ${STORY_GLOW_DEFS}
  ${storyBackdrop()}
  <rect x="0" y="0" width="12" height="${STORY_HEIGHT}" fill="${ACCENT}" />
  ${wordmarkSvg(80, 120, 48)}
  ${strainTspans}
  <text x="80" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="72" fill="${ACCENT}">${rating.toFixed(1)}/10${esc(likedSuffix)}</text>
  ${ritualRest ? `<text x="80" y="${ritualY}" font-family="DejaVu Sans" font-size="38"><tspan fill="#FFFFFF">${esc(device)}</tspan><tspan fill="${GRAY}">  ·  ${esc(ritualRest)}</tspan></text>` : `<text x="80" y="${ritualY}" font-family="DejaVu Sans" font-size="38" fill="#FFFFFF">${esc(device)}</text>`}
  ${chipSvgs.join("\n  ")}
  ${chart}
  <text x="${STORY_WIDTH / 2}" y="1720" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="42" fill="#FFFFFF">${esc(authorLabel)}</text>
  <text x="${STORY_WIDTH / 2}" y="1780" text-anchor="middle" font-family="DejaVu Sans" font-size="30" fill="${GRAY}">vaporized this</text>
  <text x="80" y="1860" font-family="DejaVu Sans" font-size="24" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

/**
 * Template "story-minimal": vertical typography only. Strain carries the
 * whole card, rating as the single accent, author at the bottom.
 */
function buildStoryMinimalSvg(session, options = {}) {
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

  const { lines, size } = layoutStrain(strain, 920, [96, 84, 72, 60], 52);
  const lineHeight = size * 1.12;
  const strainY0 = lines.length === 1 ? 420 : 340;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const ratingY = strainY0 + (lines.length - 1) * lineHeight + 120;
  const deviceY = ratingY + 70;
  const detailY = deviceY + 50;

  // Effect chart: same radar/bars logic as the other story templates.
  const rawIntensities =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const unwantedPublic = options.includeAllEffects === true || session.unwanted_effects_public === true;
  const publicIntensities = Object.fromEntries(
    Object.entries(rawIntensities).filter(([tag]) => {
      if (session.moods?.includes(tag)) return true;
      return unwantedPublic && Array.isArray(session.unwanted_effects)
        ? session.unwanted_effects.includes(tag)
        : false;
    }),
  );
  const chart = buildEffectChartSvg(
    publicIntensities,
    unwantedPublic ? session.unwanted_effects ?? [] : [],
    STORY_WIDTH / 2,
    1150,
    200,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  ${STORY_GLOW_DEFS}
  ${storyBackdrop()}
  <rect x="0" y="0" width="12" height="${STORY_HEIGHT}" fill="${ACCENT}" />
  ${wordmarkSvg(80, 140, 44)}
  ${strainTspans}
  <text x="80" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="80" fill="${ACCENT}">${rating.toFixed(1)}/10</text>
  <text x="80" y="${deviceY}" font-family="DejaVu Sans" font-size="40" fill="#FFFFFF">${esc(fitLine(device, 40, 920))}</text>
  ${details ? `<text x="80" y="${detailY}" font-family="DejaVu Sans" font-size="32" fill="${GRAY}">${esc(details)}</text>` : ""}
  ${chart}
  <text x="80" y="1780" font-family="DejaVu Sans" font-size="28" fill="${GRAY}">${esc(fitAuthor(author, 28, 600))}</text>
  <text x="1000" y="1780" text-anchor="end" font-family="DejaVu Sans" font-size="24" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

/**
 * Template "story-stats": vertical dashboard — strain header plus three big
 * number panels (rating, temperature, duration). Missing values show an em
 * dash rather than a fake zero.
 */
function buildStoryStatsSvg(session, options = {}) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");
  const temp = fmtNumber(session.temperature_c);
  const duration = fmtNumber(session.duration_min);

  const { lines, size } = layoutStrain(strain, 920, [72, 62, 54, 46], 40);
  const lineHeight = size * 1.12;
  const strainY0 = lines.length === 1 ? 300 : 250;
  const strainTspans = lines
    .map(
      (line, i) =>
        `<text x="80" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#FFFFFF">${esc(line)}</text>`,
    )
    .join("");
  const deviceY = strainY0 + (lines.length - 1) * lineHeight + 60;

  // Three stacked panels, 80..1000 with 24px gutters.
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
      const y = 520 + i * (280 + 24);
      return `<rect x="80" y="${y}" width="920" height="280" rx="24" fill="${PANEL}" />
  <text x="540" y="${y + 158}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="96" fill="${panel.accent ? ACCENT : "#FFFFFF"}">${esc(panel.value)}<tspan font-size="40" fill="${GRAY}">${esc(panel.suffix)}</tspan></text>
  <text x="540" y="${y + 224}" text-anchor="middle" font-family="DejaVu Sans" font-size="30" fill="${GRAY}">${panel.label}</text>`;
    })
    .join("\n  ");

  // Effect chart under the stat panels.
  const rawIntensities =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const unwantedPublic = options.includeAllEffects === true || session.unwanted_effects_public === true;
  const publicIntensities = Object.fromEntries(
    Object.entries(rawIntensities).filter(([tag]) => {
      if (session.moods?.includes(tag)) return true;
      return unwantedPublic && Array.isArray(session.unwanted_effects)
        ? session.unwanted_effects.includes(tag)
        : false;
    }),
  );
  const chart = buildEffectChartSvg(
    publicIntensities,
    unwantedPublic ? session.unwanted_effects ?? [] : [],
    STORY_WIDTH / 2,
    1620,
    160,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  ${STORY_GLOW_DEFS}
  ${storyBackdrop()}
  <rect x="0" y="0" width="12" height="${STORY_HEIGHT}" fill="${ACCENT}" />
  ${wordmarkSvg(80, 130, 44)}
  <text x="1000" y="130" text-anchor="end" font-family="DejaVu Sans" font-size="28" fill="${GRAY}">${esc(fitAuthor(author, 28, 500))}</text>
  ${strainTspans}
  <text x="80" y="${deviceY}" font-family="DejaVu Sans" font-size="34" fill="#C9CFCB">${esc(fitLine(device, 34, 920))}</text>
  ${panelSvgs}
  ${chart}
  <text x="80" y="1860" font-family="DejaVu Sans" font-size="24" fill="${GRAY}">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

/**
 * Template "story-journal": notebook-paper look. Every session field except
 * activities — strain, rating, ritual, aromas, flavors, effect chart, notes,
 * date, author — on lined paper with a red margin.
 */
function buildStoryJournalSvg(session, options = {}) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const paper = "#F5F0E6";
  const ink = "#1A1A1A";
  const line = "#D8D2C4";
  const margin = "#E11D48";
  const herb = "#2D6A4F";
  const red = "#DC2626";

  // Lined paper: horizontal rules every 56px, red margin at x=96.
  const rules = [];
  for (let y = 120; y < STORY_HEIGHT; y += 56) {
    rules.push(
      `<line x1="0" y1="${y}" x2="${STORY_WIDTH}" y2="${y}" stroke="${line}" stroke-width="1" />`,
    );
  }

  const ritual = [
    device,
    fmtNumber(session.temperature_c) !== null
      ? `${fmtNumber(session.temperature_c)}°C`
      : null,
    fmtNumber(session.duration_min) !== null
      ? `${fmtNumber(session.duration_min)} min`
      : null,
    fmtNumber(session.amount_g) !== null
      ? `${fmtNumber(session.amount_g)} g`
      : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const aromas = Array.isArray(session.aromas) ? session.aromas : [];
  const flavors = Array.isArray(session.flavors) ? session.flavors : [];

  // Effect chart on paper: same data, paper-safe colors.
  const rawIntensities =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const unwantedPublic =
    options.includeAllEffects === true ||
    session.unwanted_effects_public === true;
  const publicIntensities = Object.fromEntries(
    Object.entries(rawIntensities).filter(([tag]) => {
      if (Array.isArray(session.moods) && session.moods.includes(tag)) return true;
      return unwantedPublic && Array.isArray(session.unwanted_effects)
        ? session.unwanted_effects.includes(tag)
        : false;
    }),
  );
  const chart = buildEffectChartSvg(
    publicIntensities,
    unwantedPublic ? session.unwanted_effects ?? [] : [],
    STORY_WIDTH / 2 + 40,
    1150,
    240,
    { grid: line, axis: line, herb, red, label: ink },
  );

  const notes = typeof session.notes === "string" ? session.notes.trim() : "";
  const noteLines = notes ? wrapTwoLines(notes, 26, 820) : [];

  const likedSuffix = session.liked === true ? " — liked" : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  <rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="${paper}" />
  ${rules.join("\n  ")}
  <line x1="96" y1="0" x2="96" y2="${STORY_HEIGHT}" stroke="${margin}" stroke-width="3" />

  <text x="140" y="90" font-family="DejaVu Sans" font-size="26" fill="${ink}">${esc(date)}</text>
  <text x="140" y="180" font-family="DejaVu Sans" font-weight="bold" font-size="72" fill="${ink}">${esc(fitLine(strain, 72, 860))}</text>
  <text x="140" y="270" font-family="DejaVu Sans" font-weight="bold" font-size="56" fill="${herb}">${rating.toFixed(1)}/10${esc(likedSuffix)}</text>
  <text x="140" y="340" font-family="DejaVu Sans" font-size="32" fill="${ink}">${esc(fitLine(ritual, 32, 860))}</text>

  ${aromas.length > 0 ? `<text x="140" y="430" font-family="DejaVu Sans" font-size="28" fill="${ink}">Aromas: ${esc(aromas.slice(0, 5).join(", "))}</text>` : ""}
  ${flavors.length > 0 ? `<text x="140" y="490" font-family="DejaVu Sans" font-size="28" fill="${ink}">Sabores: ${esc(flavors.slice(0, 5).join(", "))}</text>` : ""}

  ${chart}

  ${noteLines.length > 0 ? noteLines.map((line, i) => `<text x="140" y="${1520 + i * 44}" font-family="DejaVu Sans" font-size="26" fill="${ink}">${esc(line)}</text>`).join("\n  ") : ""}

  <text x="140" y="1760" font-family="DejaVu Sans" font-size="30" fill="${ink}">${esc(fitAuthor(author, 30, 500))}</text>
  <text x="140" y="1820" font-family="DejaVu Sans" font-size="22" fill="${ink}" opacity="0.6">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

const TEMPLATE_BUILDERS = {
  split: buildSplitSvg,
  minimal: buildMinimalSvg,
  stats: buildStatsSvg,
  story: buildStorySvg,
  "story-minimal": buildStoryMinimalSvg,
  "story-stats": buildStoryStatsSvg,
  "story-journal": buildStoryJournalSvg,
};

/** Canvas size per template: horizontal cards for link previews, vertical for stories/TikTok. */
function templateSize(template) {
  return template.startsWith("story")
    ? { width: 1080, height: 1920 }
    : { width: WIDTH, height: HEIGHT };
}

/** Renders one session card in the requested template (validated caller-side). */
function buildCardSvg(session, template = "split", options = {}) {
  return (TEMPLATE_BUILDERS[template] ?? buildSplitSvg)(session, options);
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
      `select s.user_id, s.is_public, s.strain_slug, s.device_slug,
              s.temperature_c, s.duration_min, s.rating, s.author, s.liked,
              s.moods, s.aromas, s.flavors, s.effect_intensities,
              s.unwanted_effects, s.unwanted_effects_public,
              p.handle as owner_handle,
              d.name   as device_name
         from sessions s
         left join profiles p on p.id = s.user_id
         left join devices  d on d.slug = s.device_slug
        where s.id = $1`,
      [id],
    );
    if (rows.length === 0) {
      // Unknown id: never confirm existence — same fallback either way.
      return reply.redirect(FALLBACK_IMAGE, 302);
    }

    const session = rows[0];
    let isOwner = false;
    if (!session.is_public) {
      // Private session: only the owner may render/download the card. A
      // missing or foreign Bearer token gets the same fallback as unknown.
      const header = request.headers.authorization ?? "";
      const parts = header.trim().split(/\s+/);
      const token =
        parts.length === 2 && parts[0].toLowerCase() === "bearer"
          ? parts[1]
          : null;
      if (!token) {
        return reply.redirect(FALLBACK_IMAGE, 302);
      }
      const { rows: authRows } = await pool.query(
        `select user_id from auth_tokens where token = $1 and expires_at > now()`,
        [token],
      );
      if (authRows.length === 0 || authRows[0].user_id !== session.user_id) {
        return reply.redirect(FALLBACK_IMAGE, 302);
      }
      isOwner = true;
    }

    try {
      // The share UI picks the card design via ?t= (see OG_TEMPLATES in
      // og.js); unknown values fall back to the default split layout.
      const template = normalizeTemplate(request.query?.t);
      // The owner may include unwanted effects on a private card even when
      // they are hidden from public payloads; ?includeUnwanted=0 hides them.
      const includeAllEffects = isOwner
        ? request.query?.includeUnwanted !== "0"
        : session.unwanted_effects_public === true;
      // sessions has no updated_at; the rendered content itself is the key,
      // so editing the session changes the key and invalidates naturally.
      const cacheKey = `${id}:${template}:${includeAllEffects}:${JSON.stringify(session)}`;
      let png = cardCache.get(cacheKey);
      if (png === undefined) {
        const { width, height } = templateSize(template);
        const resvg = new Resvg(
          buildCardSvg(session, template, { includeAllEffects }),
          {
            fitTo: { mode: "width", value: width },
            font: { fontFiles: FONT_FILES, loadSystemFonts: false },
            background: "#000000",
          },
        );
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
