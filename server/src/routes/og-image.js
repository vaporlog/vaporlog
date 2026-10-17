/**
 * vaporlog API — dynamic OG card renderer for public sessions.
 *
 *   GET /api/og/s/:id/card.png  (open) → image/png, 1080×1920 (vertical)
 *     ?lang=es|en picks the card copy language (default: en). The template
 *     is always the story-journal design; the ?t= param still arrives
 *     (validated by og.js, which always resolves to story-journal) and is
 *     accepted here for signature compatibility.
 *
 * Renders a per-session Open Graph image on the fly: strain, rating, ritual
 * (device · temperature · duration), aroma/flavor/activity chips, effect
 * chart, calm↔energy bar and notes on the journal-paper design. The SVG is
 * rasterized with @resvg/resvg-js using the DejaVu fonts committed under
 * assets/fonts/ — no system fonts or apk packages needed, so it renders
 * identically on Windows dev boxes and the Alpine production container.
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
import { hashToken } from "../lib/tokens.js";
import { humanizeSlug, normalizeTemplate } from "./og.js";
import { resolveCustomOgPath } from "./custom-og.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_IMAGE = "/brand/og-default.jpg";
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

/** Temperature chip color by range: blue <170, herb 170-190, amber 190-205, red >205. */
function tempRangeColor(tempC) {
  const t = Number(tempC);
  if (t < 170) return "#2563EB";
  if (t <= 190) return "#2D6A4F";
  if (t <= 205) return "#D97706";
  return "#DC2626";
}

/**
 * Greedy word wrap into at most `maxLines` lines. Overflowing text is
 * truncated with an ellipsis on the last line (via fitLine).
 */
function wrapLines(text, fontSize, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (fitsOneLine(candidate, fontSize, maxWidth)) {
      current = candidate;
    } else {
      if (current !== "") lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    kept.push(fitLine(lines.slice(maxLines - 1).join(" "), fontSize, maxWidth));
    return kept;
  }
  return lines;
}

/**
 * Public effect intensities for the card, with the privacy rule used
 * everywhere: mood intensities are public; unwanted-effect intensities only
 * when the author opted in (or `includeAllEffects`). Effects the author
 * selected but never slid default to 5 — the slider's resting value in the
 * log form, same as the web cards. Returns the intensities map plus the
 * unwanted-effect tags that are allowed to show.
 */
function publicIntensitiesWithDefaults(session, options = {}) {
  const raw =
    session.effect_intensities && typeof session.effect_intensities === "object"
      ? session.effect_intensities
      : {};
  const moods = Array.isArray(session.moods) ? session.moods : [];
  const unwantedPublic =
    options.includeAllEffects === true ||
    session.unwanted_effects_public === true;
  const unwanted =
    unwantedPublic && Array.isArray(session.unwanted_effects)
      ? session.unwanted_effects
      : [];
  const intensities = Object.fromEntries(
    Object.entries(raw).filter(
      ([tag]) => moods.includes(tag) || unwanted.includes(tag),
    ),
  );
  for (const tag of [...moods, ...unwanted]) {
    if (intensities[tag] === undefined) intensities[tag] = 5;
  }
  return { intensities, unwanted };
}

/**
 * Effect chart for the journal card. Three or more effects render as a
 * spider/radar; one or two render as horizontal bars, which read clearer at
 * thumbnail size. Moods in the brand herb tone, unwanted effects in red. No
 * text labels on the radar — the silhouette is the signal.
 *
 * `colors` overrides the palette for light-background renders (journal).
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
    axis = "#000000",
    herb = ACCENT,
    red = "#E11D48",
    label = GRAY,
    track = PANEL,
  } = colors;
  const unwanted = new Set(unwantedEffects);
  // Group axes: every mood next to every other mood, every unwanted effect
  // next to every other unwanted one. Each group's polygon then fans out as
  // one contiguous wedge (the other group's zero points collapse at the
  // center) instead of zig-zagging through the middle when both kinds
  // interleave. Stable sort keeps the original order within each group.
  const entries = Object.entries(intensities).sort(
    (a, b) => Number(unwanted.has(a[0])) - Number(unwanted.has(b[0])),
  );
  if (entries.length === 0) return "";

  // 1-2 effects: horizontal bars, same slice style as the energy/calm bar.
  // Width scales with the chart's radius budget so the bars read wider
  // than the energy/calm bar; centered, each bar reads label + 0-10 marker.
  if (entries.length < 3) {
    const barWidth = Math.round(radius * 2.2);
    const barHeight = 22;
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

  // Data polygons: one for moods (herb), one for unwanted effects (red).
  // Zero-radius points keep the polygon closed without distorting the shape.
  const moodPoints = entries.map(([tag, intensity], i) => {
    const angle = startAngle + i * angleStep;
    const r = unwanted.has(tag)
      ? 0
      : (Math.min(Math.max(Number(intensity) || 0, 0), 10) / 10) * chartRadius;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  });
  const unwantedPoints = entries.map(([tag, intensity], i) => {
    const angle = startAngle + i * angleStep;
    const r = unwanted.has(tag)
      ? (Math.min(Math.max(Number(intensity) || 0, 0), 10) / 10) * chartRadius
      : 0;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  });
  const moodPolygon = `<polygon points="${moodPoints.join(" ")}" fill="${herb}" fill-opacity="0.22" stroke="${herb}" stroke-width="2" />`;
  const unwantedPolygon = `<polygon points="${unwantedPoints.join(" ")}" fill="${red}" fill-opacity="0.22" stroke="${red}" stroke-width="2" />`;
  const dots = entries
    .map(([tag, intensity], i) => {
      const angle = startAngle + i * angleStep;
      const r = (Math.min(Math.max(Number(intensity) || 0, 0), 10) / 10) * chartRadius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const color = unwanted.has(tag) ? red : herb;
      return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" />`;
    })
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

  return `${grid}${axes}${moodPolygon}${unwantedPolygon}${dots}${labels}`;
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

/* ------------------------------------------------------------------------ */
/* Vertical story card (1080×1920) — for download / TikTok / Reels.         */
/* ------------------------------------------------------------------------ */

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

/** Card copy for story-journal, keyed by ?lang=es|en (default en). */
const JOURNAL_LABELS = {
  en: {
    aromas: "Aromas",
    flavors: "Flavors",
    activities: "Activities",
    liked: "liked",
    vaporizedThis: "vaporized this",
    calm: "Calm",
    energized: "Energized",
    neutral: "Neutral",
  },
  es: {
    aromas: "Aromas",
    flavors: "Sabores",
    activities: "Actividades",
    liked: "le gustó",
    vaporizedThis: "vaporizó esto",
    calm: "Calma",
    energized: "Energizado",
    neutral: "Neutro",
  },
};

/**
 * Template "story-journal": notebook-paper look. Header (wordmark + date),
 * strain + author, rating + liked, ritual with a range-colored temperature
 * chip, aroma/flavor chip rows, big effect chart, calm↔energy bar, activity
 * chips, notes (max 3 lines) and footer — on lined paper with a red margin.
 * Card copy localizes via options.lang ("en" default, "es"). Activities are
 * private by default: they only render when the session's activities_public
 * flag is on, same rule as the feed.
 */
function buildStoryJournalSvg(session, options = {}) {
  const lang = options.lang === "es" ? "es" : "en";
  const t = JOURNAL_LABELS[lang];
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString(
        lang === "es" ? "es-ES" : "en-US",
        { month: "short", day: "numeric", year: "numeric" },
      )
    : "";

  const paper = "#F5F0E6";
  const ink = "#1A1A1A";
  const line = "#E8E4D8";
  const margin = "#E11D48";
  const herb = "#2D6A4F";
  const red = "#DC2626";
  const black = "#000000";
  const chipStroke = "#C9C2B0";

  // Lined paper: horizontal rules every 56px, red margin at x=96.
  const rules = [];
  for (let y = 120; y < STORY_HEIGHT; y += 56) {
    rules.push(
      `<line x1="0" y1="${y}" x2="${STORY_WIDTH}" y2="${y}" stroke="${line}" stroke-width="1" />`,
    );
  }

  // Strain + author block: word-wrap into two lines (a two-line split at a
  // word boundary never fits long strains, so wrapLines handles overflow).
  const strainLayout = (() => {
    for (const candidate of [64, 56, 48]) {
      if (fitsOneLine(strain, candidate, 800)) {
        return { lines: [strain], size: candidate };
      }
      const wrapped = wrapLines(strain, candidate, 800, 2);
      if (!wrapped[wrapped.length - 1].endsWith("…")) {
        return { lines: wrapped, size: candidate };
      }
    }
    return { lines: [fitLine(strain, 42, 800)], size: 42 };
  })();
  const { lines, size } = strainLayout;
  const lineHeight = size * 1.12;
  const strainY0 = 214;
  const strainTspans = lines
    .map(
      (strainLine, i) =>
        `<text x="140" y="${strainY0 + i * lineHeight}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="${ink}">${esc(strainLine)}</text>`,
    )
    .join("");
  const authorY = strainY0 + (lines.length - 1) * lineHeight + 54;
  const ratingY = authorY + 82;
  const ritualY = ratingY + 78;

  // Ritual: device · duration · grams, temperature as its own chip colored
  // by range so the exact value always reads on paper.
  const temp = fmtNumber(session.temperature_c);
  const ritualText = fitLine(
    [
      device,
      fmtNumber(session.duration_min) !== null
        ? `${fmtNumber(session.duration_min)} min`
        : null,
      fmtNumber(session.amount_g) !== null
        ? `${fmtNumber(session.amount_g)} g`
        : null,
    ]
      .filter(Boolean)
      .join("  ·  "),
    32,
    temp !== null ? 740 : 800,
  );
  const tempChip =
    temp !== null
      ? (() => {
          const tempLabel = `${temp}°C`;
          const chipW = Math.ceil(tempLabel.length * 30 * 0.6) + 48;
          // DejaVu at this mixed text runs narrower than the wrap estimate.
          const chipX = 140 + Math.ceil(ritualText.length * 32 * 0.5) + 24;
          return [
            `<rect x="${chipX}" y="${ritualY - 38}" width="${chipW}" height="52" rx="26" fill="${tempRangeColor(temp)}" />`,
            `<text x="${chipX + chipW / 2}" y="${ritualY - 3}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="30" fill="#FFFFFF">${esc(tempLabel)}</text>`,
          ].join("");
        })()
      : "";

  // Labeled chip rows (aromas / flavors / activities). Chips that would
  // cross x=950 are simply not drawn.
  const chipRow = (label, values, rowY, fontSize = 26, chipHeight = 52) => {
    const labelWidth = Math.ceil(label.length * fontSize * 0.62);
    let chipX = 140 + labelWidth + 30;
    const parts = [
      `<text x="140" y="${rowY + chipHeight - 15}" font-family="DejaVu Sans" font-weight="bold" font-size="${fontSize}" fill="${ink}">${esc(label)}</text>`,
    ];
    for (const value of values.slice(0, 5)) {
      const text = String(value);
      const chipW = Math.ceil(text.length * fontSize * 0.58) + 48;
      if (chipX + chipW > 950) break;
      parts.push(
        `<rect x="${chipX}" y="${rowY}" width="${chipW}" height="${chipHeight}" rx="${chipHeight / 2}" fill="#FFFFFF" stroke="${chipStroke}" stroke-width="2" />`,
        `<text x="${chipX + 24}" y="${rowY + chipHeight - 16}" font-family="DejaVu Sans" font-size="${fontSize}" fill="${ink}">${esc(text)}</text>`,
      );
      chipX += chipW + 18;
    }
    return parts.join("");
  };

  const aromas = Array.isArray(session.aromas) ? session.aromas : [];
  const flavors = Array.isArray(session.flavors) ? session.flavors : [];
  const activities =
    session.activities_public === true && Array.isArray(session.activities)
      ? session.activities
      : [];

  const chipRowSvgs = [];
  let chipRowY = ritualY + 66;
  for (const row of [
    { label: t.aromas, values: aromas },
    { label: t.flavors, values: flavors },
  ]) {
    if (row.values.length === 0) continue;
    chipRowSvgs.push(chipRow(row.label, row.values, chipRowY));
    chipRowY += 70;
  }

  // Effect chart on paper, sized up to fill the space between the chip rows
  // and the energy bar. Defaults selected-but-unslid effects to 5.
  const { intensities: publicIntensities, unwanted: publicUnwanted } =
    publicIntensitiesWithDefaults(session, options);
  const chartCy = Math.min(Math.max(chipRowY + 330, 1030), 1060);
  const chart = buildEffectChartSvg(
    publicIntensities,
    publicUnwanted,
    STORY_WIDTH / 2 + 40,
    chartCy,
    300,
    { grid: black, axis: black, herb, red, label: ink, track: line },
  );

  const energyBar = buildEnergyCalmBarSvg(
    session.energy_calm_score,
    STORY_WIDTH / 2 + 40,
    1420,
    720,
    { calm: t.calm, energized: t.energized, neutral: t.neutral },
  );

  const activitiesSvg =
    activities.length > 0
      ? chipRow(t.activities, activities, 1520, 24, 46)
      : "";

  const notes = typeof session.notes === "string" ? session.notes.trim() : "";
  const noteLines = notes ? wrapLines(notes, 26, 800, 3) : [];
  const notesY = (activities.length > 0 ? 1566 : 1496) + 62;

  const likedSuffix = session.liked === true ? ` — ${t.liked}` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  <rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="${paper}" />
  ${rules.join("\n  ")}
  <line x1="96" y1="0" x2="96" y2="${STORY_HEIGHT}" stroke="${margin}" stroke-width="3" />

  <text x="140" y="96" font-family="DejaVu Sans" font-weight="bold" font-size="34"><tspan fill="${ink}">vapor</tspan><tspan fill="${herb}">log</tspan></text>
  <text x="940" y="96" text-anchor="end" font-family="DejaVu Sans" font-size="26" fill="${ink}" opacity="0.7">${esc(date)}</text>
  ${strainTspans}
  <text x="140" y="${authorY}" font-family="DejaVu Sans" font-size="30"><tspan font-weight="bold" fill="${ink}">${esc(fitAuthor(author, 30, 320))}</tspan><tspan fill="${ink}" opacity="0.7"> · ${esc(t.vaporizedThis)}</tspan></text>
  <text x="140" y="${ratingY}" font-family="DejaVu Sans" font-weight="bold" font-size="56" fill="${herb}">${rating.toFixed(1)}/10${esc(likedSuffix)}</text>
  <text x="140" y="${ritualY}" font-family="DejaVu Sans" font-size="32" fill="${ink}">${esc(ritualText)}</text>
  ${tempChip}

  ${chipRowSvgs.join("\n  ")}

  ${chart}
  ${energyBar}
  ${activitiesSvg}

  ${noteLines.length > 0 ? noteLines.map((noteLine, i) => `<text x="140" y="${notesY + i * 42}" font-family="DejaVu Sans" font-size="26" fill="${ink}">${esc(noteLine)}</text>`).join("\n  ") : ""}

  <text x="140" y="1840" font-family="DejaVu Sans" font-size="22" fill="${ink}" opacity="0.6">vaporlog.online</text>
  <text x="940" y="1840" text-anchor="end" font-family="DejaVu Sans" font-size="22" fill="${ink}" opacity="0.6">vaporlog — the journal of the art of vaporizing</text>
</svg>`;
}

/**
 * Bipolar calm/energy bar for the journal card. -5 very calm, 0 neutral,
 * +5 very energized. Track is a muted line, marker is herb. A null score
 * means the log slider was left at rest: render neutral (0), same as the
 * web cards.
 */
function buildEnergyCalmBarSvg(score, cx, y, width, labels = {}) {
  const { calm = "Calm", energized = "Energized", neutral = "Neutral" } = labels;
  const value = Math.min(Math.max(Number(score) || 0, -5), 5);
  const pct = (value + 5) / 10;
  const x = cx - width / 2 + pct * width;
  const herb = "#2D6A4F";
  const ink = "#1A1A1A";
  const track = "#E8E4D8";
  const label = value === 0 ? neutral : value > 0 ? `+${value}` : value;
  return `
  <text x="${cx - width / 2}" y="${y - 18}" font-family="DejaVu Sans" font-size="26" fill="${ink}">${esc(calm)}</text>
  <text x="${cx + width / 2}" y="${y - 18}" text-anchor="end" font-family="DejaVu Sans" font-size="26" fill="${ink}">${esc(energized)}</text>
  <rect x="${cx - width / 2}" y="${y}" width="${width}" height="16" rx="8" fill="${track}" />
  <rect x="${x - 6}" y="${y - 5}" width="12" height="26" rx="6" fill="${herb}" />
  <text x="${cx}" y="${y + 56}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="30" fill="${herb}">${label}</text>`;
}

/**
 * Renders one session card. `template` is accepted for signature
 * compatibility (callers pass the og.js-normalized value, which is always
 * "story-journal") but the only design left is the story journal.
 */
function buildCardSvg(session, template = "story-journal", options = {}) {
  return buildStoryJournalSvg(session, options);
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
              s.energy_calm_score, s.created_at,
              s.amount_g, s.notes, s.activities, s.activities_public,
              s.custom_og_image,
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
        `select user_id from auth_tokens where token_hash = $1 and expires_at > now()`,
        [hashToken(token)],
      );
      if (authRows.length === 0 || authRows[0].user_id !== session.user_id) {
        return reply.redirect(FALLBACK_IMAGE, 302);
      }
    }

    // A shared cache in front of the API must never store a private
    // session's card: only public sessions get a public cache scope.
    const cacheScope = session.is_public ? "public" : "private";

    // Owner-built cover (CoverEditor): serve the saved file as-is. This
    // takes priority over every resvg template — the user explicitly
    // authored the design. A missing/broken file falls through to the
    // dynamic renderer so the card still shows something.
    if (typeof session.custom_og_image === "string" && session.custom_og_image !== "") {
      const absolutePath = resolveCustomOgPath(session.custom_og_image);
      if (absolutePath !== null) {
        try {
          const bytes = await fs.promises.readFile(absolutePath);
          // Cache-bytes: the file's mtime changes on every save, so this
          // header busts the browser cache on edits without query params.
          return reply
            .type("image/png")
            .header(
              "cache-control",
              `${cacheScope}, max-age=300, must-revalidate`,
            )
            .send(bytes);
        } catch {
          // File missing on disk: drop the stale reference and fall through
          // to the dynamic renderer. We don't clear the column here — the
          // DELETE endpoint exists for that — so the next upload reuses
          // the same path and the next read is a single retry away.
        }
      }
    }

    try {
      // og.js normalizes ?t= and always resolves to story-journal; the card
      // copy language comes via ?lang=es|en (default en).
      const template = normalizeTemplate(request.query?.t);
      const lang = request.query?.lang === "es" ? "es" : "en";
      // Content flags live on the session row: the owner's own toggles
      // decide what the card shows, same rule for public and private views.
      const includeAllEffects = session.unwanted_effects_public === true;
      // sessions has no updated_at; the key is built from exactly the fields
      // the card renders, so editing the session changes the key and
      // invalidates naturally (and cache hits skip a full-row stringify).
      const cacheKey = [
        id,
        template,
        lang,
        includeAllEffects,
        session.rating,
        session.strain_slug,
        session.device_slug,
        session.device_name,
        session.temperature_c,
        session.duration_min,
        session.amount_g,
        session.liked,
        session.author,
        session.owner_handle,
        session.created_at,
        session.energy_calm_score,
        session.notes,
        session.activities_public,
        JSON.stringify(session.moods),
        JSON.stringify(session.aromas),
        JSON.stringify(session.flavors),
        JSON.stringify(session.activities),
        JSON.stringify(session.effect_intensities),
        JSON.stringify(session.unwanted_effects),
      ].join("|");
      let png = cardCache.get(cacheKey);
      if (png === undefined) {
        const resvg = new Resvg(
          buildCardSvg(session, template, { includeAllEffects, lang }),
          {
            fitTo: { mode: "width", value: STORY_WIDTH },
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
        .header("cache-control", `${cacheScope}, max-age=300`)
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
