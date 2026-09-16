/*
 * Cover editor document model — layer types, session → layer builders,
 * background fills, export presets, and the small data-viz helpers
 * shared by the Konva nodes and the inspector.
 *
 * The design space is fixed at CANVAS_W × CANVAS_H; exports letterbox
 * into the chosen aspect. A document serializes as
 * { version, background, layers } (see serializeCoverDoc) and is what
 * the server persists alongside the rendered PNG.
 */

import type { SessionLog } from "@/lib/types";

export const CANVAS_W = 1200;
export const CANVAS_H = 630;

export const COVER_DOC_VERSION = 1;

/** Output dimensions of the saved PNG. */
export type ExportSize = { width: number; height: number };

export const EXPORT_PRESETS: { id: string; label: string; size: ExportSize }[] = [
  { id: "link", label: "Twitter/FB/LinkedIn", size: { width: 1200, height: 630 } },
  { id: "square", label: "Instagram square", size: { width: 1080, height: 1080 } },
  { id: "story", label: "Story (IG/TikTok)", size: { width: 1080, height: 1920 } },
  { id: "wide", label: "Facebook wide", size: { width: 1200, height: 675 } },
];

/** Returns the preset whose size matches, or null when custom. */
export function findExportPresetId(size: ExportSize): string | null {
  const match = EXPORT_PRESETS.find(
    (preset) => preset.size.width === size.width && preset.size.height === size.height,
  );
  return match === undefined ? null : match.id;
}

/** Renders the design at its native size and composites it into a
 *  target-sized canvas, letterboxed with the background color. */
export async function renderCoverToSize(
  designDataUrl: string,
  size: ExportSize,
  background: string | null,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2D canvas context unavailable — cannot resize cover.");
  }
  ctx.fillStyle = background ?? "#030303";
  ctx.fillRect(0, 0, size.width, size.height);
  const design = new window.Image();
  await new Promise<void>((resolve, reject) => {
    design.onload = () => resolve();
    design.onerror = () => reject(new Error("Design raster failed to load."));
    design.src = designDataUrl;
  });
  const scale = Math.min(size.width / CANVAS_W, size.height / CANVAS_H);
  const drawW = CANVAS_W * scale;
  const drawH = CANVAS_H * scale;
  ctx.drawImage(design, (size.width - drawW) / 2, (size.height - drawH) / 2, drawW, drawH);
  return canvas.toDataURL("image/png");
}

/** Stable per-layer id without pulling in uuid. */
export function nextId(): string {
  return `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export type BackgroundFill = "transparent" | "solid" | "herb" | "night" | "paper";

export const BG_COLOR: Record<BackgroundFill, string | null> = {
  transparent: null,
  solid: "#030303",
  herb: "#0E2418",
  night: "#0B1020",
  paper: "#F5F0E6",
};

/** Font stacks offered by the inspector. Keys map to i18n canvas.fonts.*. */
export const FONT_STACKS: Record<string, string> = {
  sans: "Inter, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', monospace",
  impact: "Impact, 'Arial Black', sans-serif",
  script: "'Brush Script MT', cursive",
};

export const DEFAULT_FONT = FONT_STACKS.sans;

// ── Layer types ─────────────────────────────────────────────────────

export type LayerBase = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** 0-1, defaults to 1 when absent (legacy docs). */
  opacity?: number;
};

/** Visual treatment for data-backed text layers. "text" is plain. */
export type TextPresentation =
  | "text"
  | "stars"
  | "dots"
  | "percent"
  | "letter"
  | "thermometer"
  | "chip"
  | "gauge";

/** What a data presentation's numeric value means. */
export type DataKind = "rating" | "temperature" | "energy";

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontSize: number;
  fill: string;
  /** Konva fontStyle string: "normal" | "bold" | "italic" | "italic bold". */
  fontStyle?: string;
  fontFamily?: string;
  width: number;
  align?: "left" | "center" | "right";
  presentation?: TextPresentation;
  /** Numeric value backing stars/thermometer/gauge presentations.
   *  Editable in the inspector; keeps the viz and `text` in sync.
   *  Legacy layers without it fall back to parsing `text`. */
  dataKind?: DataKind;
  dataValue?: number;
};

export type ImageLayer = LayerBase & {
  kind: "image";
  /** Data URL — bytes live in memory only; export re-embeds. */
  src: string;
  width: number;
  height: number;
};

export type ChartEffect = {
  tag: string;
  /** 1-10 — falls back to 5 when the slider was left at rest. */
  intensity: number;
  type: "mood" | "unwanted";
};

export type EffectsPresentation = "bar" | "list";

export type ChartLayer = LayerBase & {
  kind: "chart";
  /** Snapshot of the session's effects at add time; rows can be
   *  removed (but not invented) from the inspector. */
  effects: ChartEffect[];
  presentation?: EffectsPresentation;
  /** Panel + accent colors, editable in the inspector. */
  panelColor?: string;
  title?: string;
};

/** Tag cloud rendered as pill chips (aromas, flavors, moods, activities…). */
export type ChipsLayer = LayerBase & {
  kind: "chips";
  tags: string[];
  fontSize: number;
  chipStyle: "filled" | "outline";
  /** Chip background (filled) or border/text (outline). */
  accent: string;
  textColor: string;
  /** Wrap width of the chip flow. */
  width: number;
  align?: "left" | "center" | "right";
};

export type ShapeKind = "rect" | "ellipse";

export type ShapeLayer = LayerBase & {
  kind: "shape";
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

export type CoverLayer = TextLayer | ImageLayer | ChartLayer | ChipsLayer | ShapeLayer;

// ── Document serialization ──────────────────────────────────────────

export type CoverDoc = {
  version: number;
  background: BackgroundFill;
  layers: CoverLayer[];
};

export function serializeCoverDoc(background: BackgroundFill, layers: CoverLayer[]): string {
  const doc: CoverDoc = { version: COVER_DOC_VERSION, background, layers };
  return JSON.stringify(doc);
}

/** Parses a persisted doc; returns null on anything unusable so the
 *  caller falls back to the seed layout. Unknown/extra fields ride
 *  through untouched (forward-compatible). */
export function parseCoverDoc(raw: string | null | undefined): CoverDoc | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CoverDoc>;
    if (!Array.isArray(parsed.layers)) return null;
    const background =
      typeof parsed.background === "string" && parsed.background in BG_COLOR
        ? (parsed.background as BackgroundFill)
        : "night";
    return {
      version: COVER_DOC_VERSION,
      background,
      layers: parsed.layers as CoverLayer[],
    };
  } catch {
    return null;
  }
}

// ── Data-viz helpers ────────────────────────────────────────────────

export function ratingToLetter(rating: number): string {
  if (rating >= 9.5) return "A+";
  if (rating >= 8.5) return "A";
  if (rating >= 7.5) return "B+";
  if (rating >= 6.5) return "B";
  if (rating >= 5.5) return "C+";
  if (rating >= 4.5) return "C";
  if (rating >= 3.5) return "D+";
  if (rating >= 2.5) return "D";
  if (rating >= 1.5) return "E";
  return "F";
}

/** Rating value as a 0-5 fraction (for stars/dots). */
export function ratingToFive(rating: number): number {
  return Math.max(0, Math.min(5, rating / 2));
}

export function temperatureZone(temp: number): { label: string; color: string } {
  if (temp < 180) return { label: "low", color: "#60A5FA" };
  if (temp < 210) return { label: "medium", color: "#74C69D" };
  return { label: "high", color: "#F59E0B" };
}

/** Humanize a tag — "very-calm" → "Very calm". */
export function humanizeTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      ["thc", "cbd", "og"].includes(word)
        ? word.toUpperCase()
        : word[0].toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Reads the numeric value of a data-backed text layer, preferring the
 *  explicit dataValue and falling back to the baked string for legacy
 *  layers saved before dataValue existed. */
export function dataValueOf(layer: TextLayer): number {
  if (typeof layer.dataValue === "number" && Number.isFinite(layer.dataValue)) {
    return layer.dataValue;
  }
  const ratingMatch = /^([0-9]+(?:\.[0-9]+)?)\/10$/.exec(layer.text);
  if (ratingMatch !== null) return Number(ratingMatch[1]);
  const tempMatch = /^(-?[0-9]+)°C$/.exec(layer.text);
  if (tempMatch !== null) return Number(tempMatch[1]);
  const energyMatch = /^(-?[0-9]+)$/.exec(layer.text);
  if (energyMatch !== null) return Number(energyMatch[1]);
  return 0;
}

/** Formats the canonical text for a data-backed value so `text` stays
 *  in sync when the inspector edits dataValue. */
export function formatDataValue(kind: DataKind, value: number): string {
  switch (kind) {
    case "rating":
      return `${Math.max(0, Math.min(10, value)).toFixed(1)}/10`;
    case "temperature":
      return `${Math.round(value)}°C`;
    case "energy":
      return `${Math.round(value)}`;
  }
}

// ── Layer factories ─────────────────────────────────────────────────

const baseDefaults = {
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

export function buildTextLayer(init: {
  text: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fill?: string;
  fontStyle?: string;
  fontFamily?: string;
  width?: number;
  align?: "left" | "center" | "right";
  presentation?: TextPresentation;
  dataKind?: DataKind;
  dataValue?: number;
}): TextLayer {
  return {
    id: nextId(),
    kind: "text",
    x: init.x ?? 80,
    y: init.y ?? 80,
    ...baseDefaults,
    text: init.text,
    fontSize: init.fontSize ?? 48,
    fill: init.fill ?? "#FFFFFF",
    fontStyle: init.fontStyle ?? "normal",
    fontFamily: init.fontFamily ?? DEFAULT_FONT,
    width: init.width ?? 1040,
    align: init.align ?? "left",
    presentation: init.presentation,
    dataKind: init.dataKind,
    dataValue: init.dataValue,
  };
}

export function buildRatingLayer(
  rating: number,
  presentation: TextPresentation,
): TextLayer {
  return buildTextLayer({
    text: formatDataValue("rating", rating),
    fontSize: 96,
    fill: "#74C69D",
    fontStyle: "bold",
    presentation,
    dataKind: "rating",
    dataValue: rating,
  });
}

export function buildTemperatureLayer(
  temp: number | null,
  presentation: TextPresentation,
): TextLayer {
  const value = temp ?? 0;
  return buildTextLayer({
    text: temp === null ? "—" : formatDataValue("temperature", value),
    fontSize: 96,
    fill: "#FFFFFF",
    fontStyle: "bold",
    presentation,
    dataKind: "temperature",
    dataValue: value,
  });
}

/** Energy/calm score (-5..+5) as a centered gauge or plain text. */
export function buildEnergyLayer(
  score: number,
  presentation: "gauge" | "text",
): TextLayer {
  const clamped = Math.max(-5, Math.min(5, score));
  return buildTextLayer({
    text: formatDataValue("energy", clamped),
    fontSize: 64,
    fill: "#FFFFFF",
    fontStyle: "bold",
    width: 520,
    presentation,
    dataKind: "energy",
    dataValue: clamped,
  });
}

export function buildEffectsLayer(
  session: SessionLog,
  presentation: EffectsPresentation,
  title: string,
): ChartLayer | null {
  const effects: ChartEffect[] = [];
  for (const tag of session.moods) {
    effects.push({ tag, intensity: session.effectIntensities[tag] ?? 5, type: "mood" });
  }
  for (const tag of session.unwantedEffects) {
    effects.push({ tag, intensity: session.effectIntensities[tag] ?? 5, type: "unwanted" });
  }
  if (effects.length === 0) return null;
  return {
    id: nextId(),
    kind: "chart",
    x: 80,
    y: 60,
    ...baseDefaults,
    effects,
    presentation,
    title,
  };
}

export function buildChipsLayer(
  tags: string[],
  init?: Partial<Pick<ChipsLayer, "chipStyle" | "accent" | "textColor" | "fontSize" | "x" | "y">>,
): ChipsLayer {
  return {
    id: nextId(),
    kind: "chips",
    x: init?.x ?? 80,
    y: init?.y ?? 80,
    ...baseDefaults,
    tags,
    fontSize: init?.fontSize ?? 30,
    chipStyle: init?.chipStyle ?? "filled",
    accent: init?.accent ?? "#74C69D",
    textColor: init?.textColor ?? "#030303",
    width: 700,
    align: "left",
  };
}

export function buildShapeLayer(shape: ShapeKind): ShapeLayer {
  return {
    id: nextId(),
    kind: "shape",
    shape,
    x: 400,
    y: 220,
    ...baseDefaults,
    width: 400,
    height: 200,
    fill: "#74C69D",
    cornerRadius: shape === "rect" ? 16 : 0,
  };
}

export function buildImageLayer(init: {
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
}): ImageLayer {
  return {
    id: nextId(),
    kind: "image",
    ...baseDefaults,
    ...init,
  };
}
