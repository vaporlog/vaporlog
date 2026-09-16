import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useReducer,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ImagePlus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Type,
  Copy,
  ChevronUp,
  ChevronDown,
  BarChart3,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Star,
  CircleDot,
  Percent,
  Thermometer,
  List,
  Bold,
  Italic,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Stage,
  Layer,
  Group,
  Rect,
  Text,
  Circle,
  Image as KonvaImage,
  Transformer,
} from "react-konva";
import type Konva from "konva";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch, getToken } from "@/lib/api";
import { displayStrainName } from "@/components/session-card/display";
import { useMySessions } from "@/lib/data";
import type { SessionLog } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * /s/:id/edit-cover — owner-built cover image (custom OG card).
 *
 * Konva canvas at the canonical OG size (1200x630). The user can drop
 * background fills, image layers (uploaded stickers/photos), the brand
 * mascot, and any of five text quick-picks that pull from the session.
 * Every layer is movable / scalable / rotatable via Konva.Transformer;
 * the rendered export is posted as a data URL to the API, which writes
 * the file and stamps sessions.custom_og_image. og-image.js serves that
 * file on the next /api/og/s/:id/card.png request.
 *
 * Canvas coordinate system stays at 1200x630; CSS scales the <Stage> to
 * fit the viewport. The export uses pixelRatio=1 so the result is the
 * native 1200x630 (crawlers and WhatsApp only care about the source
 * dimensions, not the on-screen scale).
 */

const CANVAS_W = 1200;
const CANVAS_H = 630;

/** Output dimensions of the saved PNG. The design space stays at
 *  CANVAS_W × CANVAS_H; when this differs, the export letterboxes
 *  the design into the target frame using the chosen background. */
type ExportSize = { width: number; height: number };

/** Preset sizes for the share card. Each one names the platform it
 *  targets; the user can also drop a custom width/height. */
const EXPORT_PRESETS: { id: string; label: string; size: ExportSize }[] = [
  { id: "link", label: "Twitter/FB/LinkedIn", size: { width: 1200, height: 630 } },
  { id: "square", label: "Instagram square", size: { width: 1080, height: 1080 } },
  { id: "story", label: "Story (IG/TikTok)", size: { width: 1080, height: 1920 } },
  { id: "wide", label: "Facebook wide", size: { width: 1200, height: 675 } },
];

/** Returns the preset whose size matches the current export dimensions,
 *  or null when the current size is custom. */
function findExportPresetId(size: ExportSize): string | null {
  const match = EXPORT_PRESETS.find(
    (preset) => preset.size.width === size.width && preset.size.height === size.height,
  );
  return match === undefined ? null : match.id;
}

/** Renders the design at CANVAS_W × CANVAS_H (its native size) and
 *  composites it into a target-sized canvas, letterboxed with the
 *  chosen background color. This lets users pick a different aspect
 *  ratio for the saved card without re-laying out the design. */
async function renderCoverToSize(
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
  const dx = (size.width - drawW) / 2;
  const dy = (size.height - drawH) / 2;
  ctx.drawImage(design, dx, dy, drawW, drawH);
  return canvas.toDataURL("image/png");
}

/** Generate a stable per-layer id without pulling in uuid. */
function nextId(): string {
  return `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

type BackgroundFill = "transparent" | "solid" | "herb" | "night" | "paper";

const BG_COLOR: Record<BackgroundFill, string | null> = {
  transparent: null,
  solid: "#030303",
  herb: "#0E2418",
  night: "#0B1020",
  paper: "#F5F0E6",
};

type LayerBase = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontSize: number;
  fill: string;
  fontStyle?: string;
  fontFamily?: string;
  width: number;
  /** Konva text alignment — "left" by default. */
  align?: "left" | "center" | "right";
  /** Data-style presentation: re-renders the node as a stars/dots row,
   *  a thermometer, a chip, etc. when set. "text" is the default plain
   *  text rendering. The data is baked into the layer at add time. */
  presentation?:
    | "text"
    | "stars"
    | "dots"
    | "percent"
    | "letter"
    | "thermometer"
    | "chip";
};

type ImageLayer = LayerBase & {
  kind: "image";
  /** Data URL — the image bytes live in memory only; export re-embeds. */
  src: string;
  width: number;
  height: number;
};

/** Effects chart layer — one bar per effect, snapshot of the session
 *  at the moment the user dropped it. Frozen on purpose: the chart
 *  shows what the session looked like when the cover was designed. */
type ChartLayer = LayerBase & {
  kind: "chart";
  effects: Array<{
    tag: string;
    /** 1-10 — falls back to 5 when the slider was left at rest. */
    intensity: number;
    type: "mood" | "unwanted";
  }>;
  /** "bar" (default horizontal bars) or "list" (name + intensity per
   *  row). Both are rendered by CoverChartNode. */
  presentation?: EffectsPresentation;
};

type CoverLayer = TextLayer | ImageLayer | ChartLayer;

/** The undoable canvas state — `selection` lives outside the reducer
 *  because it never belongs in the history (a transient UI choice). */
type CanvasSnapshot = {
  layers: CoverLayer[];
  background: BackgroundFill;
};

type CanvasAction =
  | { type: "add_layer"; layer: CoverLayer }
  | { type: "delete_layer"; id: string }
  | { type: "update_layer"; id: string; patch: Partial<CoverLayer> }
  | {
      type: "move_layer";
      id: string;
      direction: "forward" | "backward" | "top" | "bottom";
    }
  | { type: "duplicate_layer"; id: string }
  | { type: "clear_all" }
  | { type: "set_background"; background: BackgroundFill }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset_with"; layers: CoverLayer[]; background: BackgroundFill };

type HistoryState = {
  past: CanvasSnapshot[];
  present: CanvasSnapshot;
  future: CanvasSnapshot[];
};

/** Bounded history so the stack can't grow unbounded during long sessions. */
const HISTORY_LIMIT = 50;

const EMPTY_PRESENT: CanvasSnapshot = { layers: [], background: "night" };

function historyReducer(state: HistoryState, action: CanvasAction): HistoryState {
  switch (action.type) {
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
      };
    }
    case "reset_with": {
      // Initial seed (or full re-seed): wipes history — the prior state
      // is no longer reachable from this session.
      return {
        past: [],
        present: { layers: action.layers, background: action.background },
        future: [],
      };
    }
    case "add_layer": {
      const next: CanvasSnapshot = {
        ...state.present,
        layers: [...state.present.layers, action.layer],
      };
      return pushHistory(state, next);
    }
    case "delete_layer": {
      const next: CanvasSnapshot = {
        ...state.present,
        layers: state.present.layers.filter((entry) => entry.id !== action.id),
      };
      return pushHistory(state, next);
    }
    case "update_layer": {
      const next: CanvasSnapshot = {
        ...state.present,
        layers: state.present.layers.map((entry) =>
          entry.id === action.id
            ? ({ ...entry, ...action.patch } as CoverLayer)
            : entry,
        ),
      };
      return pushHistory(state, next);
    }
    case "duplicate_layer": {
      const source = state.present.layers.find((entry) => entry.id === action.id);
      if (source === undefined) return state;
      const copy: CoverLayer = {
        ...source,
        id: nextId(),
        x: source.x + 40,
        y: source.y + 40,
      } as CoverLayer;
      const next: CanvasSnapshot = {
        ...state.present,
        layers: [...state.present.layers, copy],
      };
      return pushHistory(state, next);
    }
    case "move_layer": {
      const layers = state.present.layers.slice();
      const index = layers.findIndex((entry) => entry.id === action.id);
      if (index === -1) return state;
      const [entry] = layers.splice(index, 1);
      let target: number;
      switch (action.direction) {
        case "forward":
          target = Math.min(layers.length, index + 1);
          break;
        case "backward":
          target = Math.max(0, index - 1);
          break;
        case "top":
          target = layers.length;
          break;
        case "bottom":
          target = 0;
          break;
      }
      layers.splice(target, 0, entry);
      return pushHistory(state, { ...state.present, layers });
    }
    case "clear_all": {
      if (state.present.layers.length === 0) return state;
      return pushHistory(state, { ...state.present, layers: [] });
    }
    case "set_background": {
      if (state.present.background === action.background) return state;
      return pushHistory(state, {
        ...state.present,
        background: action.background,
      });
    }
  }
}

function pushHistory(
  state: HistoryState,
  next: CanvasSnapshot,
): HistoryState {
  const past =
    state.past.length >= HISTORY_LIMIT
      ? [...state.past.slice(state.past.length - HISTORY_LIMIT + 1), state.present]
      : [...state.past, state.present];
  return { past, present: next, future: [] };
}

type QuickField = "strain" | "device" | "temperature" | "rating" | "date";

/** Visual treatment for the rating quick-pick. Each is rendered as a
 *  self-contained Konva.Group (or Konva.Text) at add time. The numeric
 *  source is baked into the layer so the visual is stable across edits. */
type RatingPresentation = "text" | "stars" | "dots" | "percent" | "letter";

/** Visual treatment for the temperature quick-pick. */
type TemperaturePresentation = "text" | "thermometer" | "chip";

/** Visual treatment for the effects chart. */
type EffectsPresentation = "bar" | "list";

/** Maps a 1-10 rating to a Latin letter grade (10 → A+, 9 → A, 8 → B+,
 *  …). Used by the "letter" rating presentation. */
function ratingToLetter(rating: number): string {
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

/** Maps a temperature (Celsius) to a zone + accent color. The
 *  thermometer + chip presentations color themselves by zone. */
function temperatureZone(
  temp: number,
): { label: string; color: string } {
  if (temp < 180) return { label: "low", color: "#60A5FA" };
  if (temp < 210) return { label: "medium", color: "#74C69D" };
  return { label: "high", color: "#F59E0B" };
}

/** Builds the text + default font size for one of the session quick-pick
 *  fields. Numbers, units, and the rating suffix stay in the user's
 *  preferred language via Intl. */
function quickPickValue(
  field: QuickField,
  session: SessionLog,
  strainName: string,
): { text: string; size: number } {
  const deviceName = session.deviceSlug;
  switch (field) {
    case "strain":
      return { text: strainName, size: 96 };
    case "device":
      return { text: deviceName, size: 44 };
    case "temperature":
      return {
        text: session.temperatureC === null ? "—" : `${session.temperatureC}°C`,
        size: 56,
      };
    case "rating":
      return { text: `${session.rating.toFixed(1)}/10`, size: 64 };
    case "date":
      return {
        text: new Date(session.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        size: 36,
      };
  }
}

/** Rating value as a 0-5 fraction (for stars/dots). */
function ratingToFive(rating: number): number {
  return Math.max(0, Math.min(5, rating / 2));
}

/** Builds a text layer whose presentation renders as a custom data
 *  visualization. `width` is the design bounding box (used for the
 *  stars/dots/thermometer rows); height is auto-fit by Konva. */
function buildRatingLayer(
  rating: number,
  presentation: RatingPresentation,
): TextLayer {
  const baseX = 80;
  const baseY = 80;
  const text = `${rating.toFixed(1)}/10`;
  return {
    id: nextId(),
    kind: "text",
    text,
    x: baseX,
    y: baseY,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    fontSize: 96,
    fill: "#74C69D",
    fontStyle: "bold",
    fontFamily: "Inter, system-ui, sans-serif",
    width: 1040,
    align: "left",
    presentation,
  };
}

function buildTemperatureLayer(
  temp: number | null,
  presentation: TemperaturePresentation,
): TextLayer {
  return {
    id: nextId(),
    kind: "text",
    text: temp === null ? "—" : `${temp}°C`,
    x: 80,
    y: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    fontSize: 96,
    fill: "#FFFFFF",
    fontStyle: "bold",
    fontFamily: "Inter, system-ui, sans-serif",
    width: 1040,
    align: "left",
    presentation,
  };
}

function buildEffectsLayer(
  session: SessionLog,
  presentation: EffectsPresentation,
): ChartLayer | null {
  const effects: ChartLayer["effects"] = [];
  for (const tag of session.moods) {
    effects.push({
      tag,
      intensity: session.effectIntensities[tag] ?? 5,
      type: "mood",
    });
  }
  for (const tag of session.unwantedEffects) {
    effects.push({
      tag,
      intensity: session.effectIntensities[tag] ?? 5,
      type: "unwanted",
    });
  }
  if (effects.length === 0) return null;
  return {
    id: nextId(),
    kind: "chart",
    x: 80,
    y: 60,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    effects,
    presentation,
  };
}

/** Loads one <img> from a data URL; the state is the HTMLImageElement
 *  once decoded, null while pending or on error. */
function useHtmlImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (src === null) {
      setImg(null);
      return;
    }
    const element = new window.Image();
    element.crossOrigin = "anonymous";
    let cancelled = false;
    element.onload = () => {
      if (!cancelled) setImg(element);
    };
    element.onerror = () => {
      if (!cancelled) setImg(null);
    };
    element.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return img;
}

/** One Konva.Image bound to a src — returns null while the bitmap is
 *  still decoding so the user briefly sees a placeholder rect.
 *  Defined below as CoverImageNode so the per-layer ref can register
 *  the actual Konva node with the Transformer registry. */

export default function CoverEditor() {
  const { t } = useTranslation("coverEditor");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { sessions, loading } = useMySessions();
  const session = useMemo(
    () => sessions.find((entry) => entry.id === id) ?? null,
    [sessions, id],
  );

  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [],
    present: EMPTY_PRESENT,
    future: [],
  });
  const layers = historyState.present.layers;
  const background = historyState.present.background;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  /** Final export size. The design always lives in CANVAS_W × CANVAS_H;
   *  if the chosen size doesn't match, the export is letterboxed with
   *  the chosen background color. The default is the standard OG link
   *  card (Twitter/FB/LinkedIn). */
  const [exportSize, setExportSize] = useState<ExportSize>({
    width: CANVAS_W,
    height: CANVAS_H,
  });

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRegistry = useRef<Map<string, Konva.Node>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auth gate: not signed in → back to welcome. Owner check happens once
  // the session list resolves; an unknown id lands in the same "not owner"
  // branch so we never confirm whether the session exists.
  useEffect(() => {
    if (getToken() === null) {
      void navigate(`/welcome?next=/s/${id}/edit-cover`, { replace: true });
    }
  }, [navigate, id]);

  // Seed a default layout the first time the session resolves — gives
  // the owner something to react to instead of a blank canvas. Skips
  // if they already started editing (e.g. navigated back).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (session === null || seededRef.current === session.id) return;
    if (layers.length > 0) {
      seededRef.current = session.id;
      return;
    }
    const strainName = displayStrainName(session.strainSlug);
    dispatch({
      type: "reset_with",
      background: "night",
      layers: [
        {
          id: nextId(),
          kind: "text",
          text: strainName,
          x: 80,
          y: 200,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          fontSize: 120,
          fill: "#74C69D",
          fontStyle: "bold",
          width: 1040,
          align: "left",
        },
        {
          id: nextId(),
          kind: "text",
          text: `${session.rating.toFixed(1)}/10`,
          x: 80,
          y: 360,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          fontSize: 72,
          fill: "#FFFFFF",
          width: 600,
          align: "left",
        },
        {
          id: nextId(),
          kind: "text",
          text: [
            session.deviceSlug,
            session.temperatureC === null ? null : `${session.temperatureC}°C`,
          ]
            .filter(Boolean)
            .join(" · "),
          x: 80,
          y: 480,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          fontSize: 36,
          fill: "#9BA3A0",
          width: 1040,
          align: "left",
        },
      ],
    });
    seededRef.current = session.id;
  }, [session, layers.length]);

  // Keep the Transformer pinned to the selected node. The registry is
  // populated by each layer's ref callback so the transformer can find
  // the node without us threading refs through props.
  useEffect(() => {
    const tr = transformerRef.current;
    if (tr === null) return;
    if (selectedId === null) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = nodeRegistry.current.get(selectedId);
    if (node === undefined) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    tr.nodes([node]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers]);

  const strainName = session ? displayStrainName(session.strainSlug) : "";

  const addText = useCallback(
    (field: QuickField) => {
      if (session === null) return;
      const { text, size } = quickPickValue(field, session, strainName);
      dispatch({
        type: "add_layer",
        layer: {
          id: nextId(),
          kind: "text",
          text,
          x: 80,
          y: 80,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          fontSize: size,
          fill: field === "strain" ? "#74C69D" : "#FFFFFF",
          fontStyle: field === "strain" || field === "rating" ? "bold" : "normal",
          width: 1040,
          align: field === "strain" || field === "rating" ? "center" : "left",
        },
      });
    },
    [session, strainName],
  );

  /** Drops a free-form text layer and auto-selects it so the user can
   *  type more / drag it immediately from the selection toolbar. */
  const addCustomText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const id = nextId();
    dispatch({
      type: "add_layer",
      layer: {
        id,
        kind: "text",
        text: trimmed,
        x: 120,
        y: 120,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        fontSize: 48,
        fill: "#FFFFFF",
        fontStyle: "normal",
        width: 960,
        align: "left",
      },
    });
    setSelectedId(id);
  }, []);

  /** Generic add-helper used by the rating / temperature / effects
   *  dropdowns. Dispatches and selects the new layer in one shot. */
  const addLayer = useCallback((layer: CoverLayer) => {
    dispatch({ type: "add_layer", layer });
    setSelectedId(layer.id);
  }, []);

  const addRating = useCallback(
    (presentation: RatingPresentation) => {
      if (session === null) return;
      addLayer(buildRatingLayer(session.rating, presentation));
    },
    [session, addLayer],
  );

  const addTemperature = useCallback(
    (presentation: TemperaturePresentation) => {
      if (session === null) return;
      addLayer(buildTemperatureLayer(session.temperatureC, presentation));
    },
    [session, addLayer],
  );

  const addEffects = useCallback(
    (presentation: EffectsPresentation) => {
      if (session === null) return;
      const layer = buildEffectsLayer(session, presentation);
      if (layer === null) {
        toast.error(t("canvas.chartNoEffects"));
        return;
      }
      addLayer(layer);
    },
    [session, t, addLayer],
  );

  const addImageFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const src = reader.result;
      const probe = new window.Image();
      probe.onload = () => {
        const maxSide = 400;
        const scale = Math.min(
          maxSide / probe.naturalWidth,
          maxSide / probe.naturalHeight,
          1,
        );
        const width = Math.round(probe.naturalWidth * scale);
        const height = Math.round(probe.naturalHeight * scale);
        dispatch({
          type: "add_layer",
          layer: {
            id: nextId(),
            kind: "image",
            src,
            x: (CANVAS_W - width) / 2,
            y: (CANVAS_H - height) / 2,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            width,
            height,
          },
        });
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  const addMascot = useCallback(async () => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    const response = await fetch("/api/og/mascot.png", { headers });
    if (!response.ok) {
      toast.error(t("save.error"));
      return;
    }
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const probe = new window.Image();
      probe.onload = () => {
        const targetHeight = 240;
        const scale = targetHeight / probe.naturalHeight;
        const width = Math.round(probe.naturalWidth * scale);
        const height = targetHeight;
        dispatch({
          type: "add_layer",
          layer: {
            id: nextId(),
            kind: "image",
            src: reader.result as string,
            x: CANVAS_W - width - 80,
            y: CANVAS_H - height - 80,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            width,
            height,
          },
        });
      };
      probe.src = reader.result as string;
    };
    reader.readAsDataURL(blob);
  }, [t]);

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<CoverLayer>) => {
      dispatch({ type: "update_layer", id: layerId, patch });
    },
    [],
  );

  const deleteSelected = useCallback(() => {
    if (selectedId === null) return;
    dispatch({ type: "delete_layer", id: selectedId });
    setSelectedId(null);
  }, [selectedId]);

  const duplicateSelected = useCallback(() => {
    if (selectedId === null) return;
    dispatch({ type: "duplicate_layer", id: selectedId });
  }, [selectedId]);

  const moveLayer = useCallback(
    (layerId: string, direction: "forward" | "backward" | "top" | "bottom") => {
      dispatch({ type: "move_layer", id: layerId, direction });
    },
    [],
  );

  const clearAll = useCallback(() => {
    dispatch({ type: "clear_all" });
    setSelectedId(null);
  }, []);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  // ── Inline text editing overlay ───────────────────────────────────
  // Local draft for the textarea — committed back to the layer (and
  // pushed to history) only on blur or Enter, so undo doesn't capture
  // every keystroke. The Konva.Text node is hidden while editing so
  // the overlay is the only visible representation of the text.
  const [editingText, setEditingText] = useState<string>("");
  useEffect(() => {
    if (editingId === null) return;
    const layer = layers.find((entry) => entry.id === editingId);
    setEditingText(layer?.kind === "text" ? layer.text : "");
  }, [editingId, layers]);

  // The canvas wrapper's display size follows the export aspect ratio
  // (selected via the size picker). The design itself always lives in
  // CANVAS_W × CANVAS_H; the wrapper's CSS aspect-ratio + a uniform
  // scale + flex centering make the design letterbox inside whatever
  // frame the user picked, with the chosen background color filling
  // the rest. The AppLayout's max-w-3xl main column caps the width so
  // the canvas never overflows.
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const wrapper = canvasWrapRef.current;
    if (wrapper === null) return;
    const measure = () => {
      const rect = wrapper.getBoundingClientRect();
      setDisplaySize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer !== null) observer.observe(wrapper);
    window.addEventListener("resize", measure);
    return () => {
      if (observer !== null) observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [exportSize.width, exportSize.height]);

  // Uniform scale — the design fits the wrapper without distortion. The
  // background color fills the letterbox area.
  const displayScale =
    displaySize.width > 0 && displaySize.height > 0
      ? Math.min(displaySize.width / CANVAS_W, displaySize.height / CANVAS_H)
      : 0;
  // Letterbox offset of the design inside the stage, in design pixels.
  // When the export aspect matches the design (1200:630), this is (0,0).
  // For a square or story frame, the design is centered with empty
  // space on the long axis.
  const designOffsetX =
    displayScale > 0
      ? (displaySize.width / displayScale - CANVAS_W) / 2
      : 0;
  const designOffsetY =
    displayScale > 0
      ? (displaySize.height / displayScale - CANVAS_H) / 2
      : 0;

  /** Measure the editing text node in screen coords. Konva scales the
   *  stage canvas by `displayScale` (display / design), so the rect
   *  returned by getClientRect is in design space and needs to be
   *  multiplied by that scale. The whole design sits inside a Group
   *  with a letterbox offset (designOffsetX/Y), which is added before
   *  the scale so the textarea lands on the visible design. */
  const editingRect = useMemo(() => {
    if (editingId === null) return null;
    const node = nodeRegistry.current.get(editingId);
    if (node === null || node === undefined) return null;
    const stage = node.getStage();
    if (stage === null) return null;
    // The whole design is wrapped in a Group with a letterbox offset
    // (designOffsetX/Y) so it can sit centered inside whatever aspect
    // the user picked for the export. The node's design-space rect,
    // plus the Group's offset, plus the stage's uniform scale, gives
    // the on-screen position of the textarea overlay.
    const nodeRect = node.getClientRect({ relativeTo: stage });
    const scaleX = stage.scaleX();
    const scaleY = stage.scaleY();
    return {
      x: (designOffsetX + nodeRect.x) * scaleX,
      y: (designOffsetY + nodeRect.y) * scaleY,
      width: Math.max(80, nodeRect.width * scaleX),
      height: Math.max(40, nodeRect.height * scaleY),
    };
  }, [editingId, layers, designOffsetX, designOffsetY]);

  const editingLayer = editingId === null
    ? null
    : layers.find((entry) => entry.id === editingId) ?? null;

  const commitEditing = useCallback(() => {
    if (editingId === null) return;
    const layer = layers.find((entry) => entry.id === editingId);
    if (layer?.kind === "text" && layer.text !== editingText) {
      dispatch({
        type: "update_layer",
        id: editingId,
        patch: { text: editingText },
      });
    }
    setEditingId(null);
  }, [editingId, editingText, layers]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  // Esc cancels inline edit; Delete/Backspace removes the selected
  // layer; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Bound on
  // window so the canvas itself doesn't have to own focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) dispatch({ type: "redo" });
        else dispatch({ type: "undo" });
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (inField) return;
      if (editingId !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEditing();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId === null) return;
        event.preventDefault();
        dispatch({ type: "delete_layer", id: selectedId });
        setSelectedId(null);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, selectedId, cancelEditing]);

  const handleSave = useCallback(async () => {
    const stage = stageRef.current;
    if (stage === null || saving) return;
    setSaving(true);
    setSelectedId(null);
    // Defer to next frame so the transformer / selection rect disappear
    // from the export — otherwise the handles ship in the PNG.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      // Always rasterize the design at its native design size, then
      // composite into the target size (letterboxed with the chosen
      // background). This keeps positions/sizes stable across aspect
      // ratios — switching the export doesn't shift the design.
      const designDataUrl = stage.toDataURL({
        pixelRatio: 1,
        mimeType: "image/png",
        width: CANVAS_W,
        height: CANVAS_H,
      });
      const dataUrl =
        exportSize.width === CANVAS_W && exportSize.height === CANVAS_H
          ? designDataUrl
          : await renderCoverToSize(
              designDataUrl,
              exportSize,
              BG_COLOR[background],
            );
      await apiFetch(`/sessions/${id}/custom-og`, {
        method: "POST",
        body: { image: dataUrl },
        auth: true,
      });
      toast.success(t("save.success"));
    } catch (error) {
      const message =
        (error as Error).message === ""
          ? t("save.error")
          : (error as Error).message;
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [id, saving, t, exportSize, background]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await apiFetch(`/sessions/${id}/custom-og`, {
        method: "DELETE",
        auth: true,
      });
      toast.success(t("restore.success"));
    } catch {
      toast.error(t("restore.error"));
    } finally {
      setRestoring(false);
    }
  }, [id, restoring, t]);

  // ── Render guards ─────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="flex flex-col items-center gap-3 py-16 text-center">
        <Toaster />
        <p className="text-muted-foreground">{t("loading")}</p>
      </section>
    );
  }

  if (session === null) {
    return (
      <section className="flex flex-col items-center gap-3 py-16 text-center">
        <Toaster />
        <p className="text-muted-foreground">{t("notOwner")}</p>
        <Button asChild variant="outline" className="pressable">
          <Link to={`/s/${id}`}>
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Link>
        </Button>
      </section>
    );
  }

  const selectedLayer = layers.find((entry) => entry.id === selectedId) ?? null;
  const canSave = layers.length > 0 && !saving;

  // The canvas wrapper's display size follows the export aspect ratio
  // (selected via the size picker). The design itself always lives in
  // CANVAS_W × CANVAS_H; the wrapper's CSS aspect-ratio + a uniform
  // scale + flex centering make the design letterbox inside whatever
  // frame the user picked, with the chosen background color filling
  // the rest. The AppLayout's max-w-3xl main column caps the width so
  // the canvas never overflows.

  return (
    <section
      // The canvas wrapper can be wider than the main column when the
      // user picks a larger export size; horizontal scrolling inside
      // the section keeps the toolbar/save controls in place while the
      // canvas itself grows.
      className="flex flex-col gap-4 overflow-x-auto"
    >
      <Toaster />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="pressable">
            <Link to={`/s/${session.id}`}>
              <ArrowLeft className="size-4" aria-hidden />
              {t("back")}
            </Link>
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {strainName} · {session.rating.toFixed(1)}/10
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.customOgImage ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={restoring}
                  className="pressable"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  {t("restore.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("restore.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("restore.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="pressable">
                    {t("restore.cancelCta")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleRestore()}
                    className="pressable"
                  >
                    {t("restore.confirmCta")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <select
            aria-label={t("save.sizeLabel")}
            value={findExportPresetId(exportSize) ?? "custom"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "custom") return;
              const preset = EXPORT_PRESETS.find((p) => p.id === value);
              if (preset !== undefined) {
                setExportSize(preset.size);
              }
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {EXPORT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.size.width}×{preset.size.height} · {t(`save.size.${preset.id}`)}
              </option>
            ))}
            <option value="custom">
              {exportSize.width}×{exportSize.height} · {t("save.size.custom")}
            </option>
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="pressable herb-hover bg-herb text-herb-foreground"
          >
            <Save className="size-4" aria-hidden />
            {saving ? t("save.saving") : t("save.button")}
          </Button>
        </div>
        <div className="flex w-full items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
            aria-label={t("canvas.undo")}
            className="pressable"
          >
            <Undo2 className="size-4" aria-hidden />
            {t("canvas.undo")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
            aria-label={t("canvas.redo")}
            className="pressable"
          >
            <Redo2 className="size-4" aria-hidden />
            {t("canvas.redo")}
          </Button>
        </div>
      </header>

      {/* Toolbar: text quick-picks, custom text, image upload, mascot, chart,
          background picker, clear. Wraps cleanly on mobile. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <span className="text-xs font-medium text-muted-foreground">
          {t("fields.strain")}
        </span>
        {/* Strain, device, date — single presentation. */}
        {(["strain", "device", "date"] as QuickField[]).map((field) => (
          <Button
            key={field}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addText(field)}
            className="pressable"
          >
            <Type className="size-3.5" aria-hidden />
            {t(`fields.${field}`)}
          </Button>
        ))}

        {/* Rating — multiple visual treatments. Each adds a TextLayer
            with a different `presentation` flag; the render branch
            handles stars / dots / percent / letter layouts. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pressable"
            >
              <Star className="size-3.5" aria-hidden />
              {t("fields.rating")}
              <ChevronDown className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>{t("fields.rating")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => addRating("text")}>
              <Type className="size-3.5" aria-hidden />
              {t("canvas.rating.text")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRating("stars")}>
              <Star className="size-3.5" aria-hidden />
              {t("canvas.rating.stars")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRating("dots")}>
              <CircleDot className="size-3.5" aria-hidden />
              {t("canvas.rating.dots")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRating("percent")}>
              <Percent className="size-3.5" aria-hidden />
              {t("canvas.rating.percent")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRating("letter")}>
              <Type className="size-3.5" aria-hidden />
              {t("canvas.rating.letter")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Temperature — text, thermometer, chip. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pressable"
            >
              <Thermometer className="size-3.5" aria-hidden />
              {t("fields.temperature")}
              <ChevronDown className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>{t("fields.temperature")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => addTemperature("text")}>
              <Type className="size-3.5" aria-hidden />
              {t("canvas.temperature.text")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addTemperature("thermometer")}>
              <Thermometer className="size-3.5" aria-hidden />
              {t("canvas.temperature.thermometer")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addTemperature("chip")}>
              <span className="size-3.5 rounded-sm bg-herb" aria-hidden />
              {t("canvas.temperature.chip")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-2 hidden h-5 w-px bg-border sm:block" />

        {/* Free-form text — small inline input that drops a new text layer
            on Enter / button click. The new layer is auto-selected so the
            user can immediately retype or drag it from the selection bar. */}
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem(
              "customText",
            ) as HTMLInputElement | null;
            if (input === null) return;
            addCustomText(input.value);
            input.value = "";
          }}
        >
          <input
            name="customText"
            type="text"
            placeholder={t("canvas.customTextPlaceholder")}
            className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="pressable"
          >
            <Type className="size-3.5" aria-hidden />
            {t("canvas.addText")}
          </Button>
        </form>

        <span className="ml-2 hidden h-5 w-px bg-border sm:block" />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="pressable"
        >
          <ImagePlus className="size-3.5" aria-hidden />
          {t("canvas.addImage")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) addImageFromFile(file);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void addMascot()}
          className="pressable"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {t("canvas.addMascot")}
        </Button>
        {/* Effects chart — bar or list presentation. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pressable"
            >
              <BarChart3 className="size-3.5" aria-hidden />
              {t("canvas.addChart")}
              <ChevronDown className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => addEffects("bar")}>
              <BarChart3 className="size-3.5" aria-hidden />
              {t("canvas.effects.bar")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addEffects("list")}>
              <List className="size-3.5" aria-hidden />
              {t("canvas.effects.list")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-2 hidden h-5 w-px bg-border sm:block" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={layers.length === 0}
          className="pressable"
        >
          <Trash2 className="size-3.5" aria-hidden />
          {t("canvas.clearAll")}
        </Button>

        <span className="ml-2 hidden h-5 w-px bg-border sm:block" />

        <span className="text-xs font-medium text-muted-foreground">
          {t("backgrounds.label")}
        </span>
        {(
          ["solid", "herb", "night", "paper"] as Exclude<
            BackgroundFill,
            "transparent"
          >[]
        ).map((option) => (
          <button
            key={option}
            type="button"
            aria-label={t(`backgrounds.${option}`)}
            aria-pressed={background === option}
            onClick={() => dispatch({ type: "set_background", background: option })}
            className={cn(
              "pressable size-6 rounded-full border-2 transition-colors",
              background === option
                ? "border-herb"
                : "border-border hover:border-foreground/40",
            )}
            style={{ background: BG_COLOR[option] ?? "#000" }}
          />
        ))}
      </div>

      {/* Selection toolbar — only when something is selected. */}
      {selectedLayer !== null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
          {selectedLayer.kind === "text" ? (
            <input
              type="text"
              value={selectedLayer.text}
              onChange={(event) =>
                updateLayer(selectedLayer.id, { text: event.target.value })
              }
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          ) : selectedLayer.kind === "image" ? (
            <span className="text-xs text-muted-foreground">
              {Math.round(selectedLayer.width)}×{Math.round(selectedLayer.height)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {selectedLayer.effects.length} effects
            </span>
          )}
          {selectedLayer.kind === "text" ? (
            <input
              type="number"
              min={12}
              max={200}
              value={selectedLayer.fontSize}
              onChange={(event) =>
                updateLayer(selectedLayer.id, {
                  fontSize: Number(event.target.value) || selectedLayer.fontSize,
                })
              }
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          ) : null}
          {selectedLayer.kind === "text" ? (
            <select
              aria-label={t("canvas.fontFamily")}
              value={
                selectedLayer.fontFamily ?? "Inter, system-ui, sans-serif"
              }
              onChange={(event) =>
                updateLayer(selectedLayer.id, {
                  fontFamily: event.target.value,
                })
              }
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="Inter, system-ui, sans-serif">
                {t("canvas.fonts.sans")}
              </option>
              <option value="Georgia, serif">{t("canvas.fonts.serif")}</option>
              <option value="'Courier New', monospace">
                {t("canvas.fonts.mono")}
              </option>
              <option value="Impact, 'Arial Black', sans-serif">
                {t("canvas.fonts.impact")}
              </option>
              <option value="'Brush Script MT', cursive">
                {t("canvas.fonts.script")}
              </option>
            </select>
          ) : null}
          {selectedLayer.kind === "text" ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                aria-label={t("canvas.bold")}
                aria-pressed={
                  (selectedLayer.fontStyle ?? "normal").includes("bold")
                }
                onClick={() => {
                  const current = selectedLayer.fontStyle ?? "normal";
                  const isBold = current.includes("bold");
                  const next = isBold
                    ? current.replace("bold", "").trim() || "normal"
                    : `${current} bold`.trim();
                  updateLayer(selectedLayer.id, { fontStyle: next });
                }}
                className={cn(
                  "pressable rounded-sm p-1",
                  (selectedLayer.fontStyle ?? "normal").includes("bold")
                    ? "bg-herb text-herb-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Bold className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t("canvas.italic")}
                aria-pressed={
                  (selectedLayer.fontStyle ?? "normal").includes("italic")
                }
                onClick={() => {
                  const current = selectedLayer.fontStyle ?? "normal";
                  const isItalic = current.includes("italic");
                  const next = isItalic
                    ? current.replace("italic", "").trim() || "normal"
                    : `${current} italic`.trim();
                  updateLayer(selectedLayer.id, { fontStyle: next });
                }}
                className={cn(
                  "pressable rounded-sm p-1",
                  (selectedLayer.fontStyle ?? "normal").includes("italic")
                    ? "bg-herb text-herb-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Italic className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
          {selectedLayer.kind === "text" ? (
            <input
              type="color"
              value={selectedLayer.fill}
              onChange={(event) =>
                updateLayer(selectedLayer.id, { fill: event.target.value })
              }
              className="size-8 cursor-pointer rounded-md border border-border bg-background"
            />
          ) : null}
          {selectedLayer.kind === "text" ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              {(["left", "center", "right"] as const).map((alignment) => (
                <button
                  key={alignment}
                  type="button"
                  aria-label={t(`canvas.align.${alignment}`)}
                  aria-pressed={selectedLayer.align === alignment}
                  onClick={() =>
                    updateLayer(selectedLayer.id, { align: alignment })
                  }
                  className={cn(
                    "pressable rounded-sm p-1",
                    selectedLayer.align === alignment
                      ? "bg-herb text-herb-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {alignment === "left" ? (
                    <AlignLeft className="size-3.5" aria-hidden />
                  ) : alignment === "center" ? (
                    <AlignCenter className="size-3.5" aria-hidden />
                  ) : (
                    <AlignRight className="size-3.5" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => moveLayer(selectedLayer.id, "top")}
            aria-label={t("canvas.bringToFront")}
            className="pressable"
          >
            <ChevronUp className="size-3.5" aria-hidden />
            {t("canvas.front")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => moveLayer(selectedLayer.id, "bottom")}
            aria-label={t("canvas.sendToBack")}
            className="pressable"
          >
            <ChevronDown className="size-3.5" aria-hidden />
            {t("canvas.back")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={duplicateSelected}
            aria-label={t("canvas.duplicate")}
            className="pressable"
          >
            <Copy className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={deleteSelected}
            aria-label={t("canvas.delete")}
            className="pressable"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("subtitle")}</p>

      {/* Canvas wrapper — CSS aspect-ratio keeps the 1200/630 proportions;
          the Stage inside renders at the wrapper's measured pixel size
          and scales the 1200x630 design onto it. Centered with mx-auto
          and capped at 1200px so it never overflows the main column. */}
      <div
        ref={canvasWrapRef}
        className="relative mx-auto overflow-hidden rounded-xl border border-border shadow-sm"
        style={{
          // The wrapper fits the viewport: width follows the main
          // column up to 1200px, height is capped at viewport minus
          // the room the toolbars/header need (≈320px). The aspect
          // ratio is the export's, so the canvas grows in the
          // direction the user picks (wide / square / tall) without
          // ever spilling off the screen.
          width: "100%",
          maxWidth: 1200,
          maxHeight: "calc(100dvh - 320px)",
          aspectRatio: `${exportSize.width} / ${exportSize.height}`,
          background: BG_COLOR[background] ?? "#030303",
        }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_W}
          height={CANVAS_H}
          scaleX={displayScale}
          scaleY={displayScale}
          aria-label={t("canvas.ariaLabel")}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) {
              setSelectedId(null);
            }
          }}
          onTouchStart={(event) => {
            if (event.target === event.target.getStage()) {
              setSelectedId(null);
            }
          }}
        >
          <Layer>
            {/* Single Group wraps the whole design so it can be
                re-centered inside the export frame when the user
                picks a different aspect ratio. designOffsetX/Y are
                in design pixels (the Group lives inside the scaled
                Stage); translating the Group shifts the design in
                the stage's display space. */}
            <Group x={designOffsetX} y={designOffsetY}>
              {BG_COLOR[background] !== null ? (
                <Rect
                  x={0}
                  y={0}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  fill={BG_COLOR[background] ?? "#000000"}
                  listening={false}
                />
              ) : null}
              {layers.map((layer) =>
              layer.kind === "text" &&
              (layer.presentation === undefined ||
                layer.presentation === "text") ? (
                <Text
                  key={layer.id}
                  ref={(node) => {
                    if (node === null) {
                      nodeRegistry.current.delete(layer.id);
                      return;
                    }
                    nodeRegistry.current.set(layer.id, node);
                  }}
                  x={layer.x}
                  y={layer.y}
                  text={layer.text}
                  fontSize={layer.fontSize}
                  fill={layer.fill}
                  fontStyle={layer.fontStyle ?? "normal"}
                  fontFamily={layer.fontFamily ?? "Inter, system-ui, sans-serif"}
                  width={layer.width}
                  wrap="word"
                  align={layer.align ?? "left"}
                  rotation={layer.rotation}
                  scaleX={layer.scaleX}
                  scaleY={layer.scaleY}
                  draggable
                  // Konva listens to dblclick on the same node — opening
                  // the inline editor in the handler would race with the
                  // selection click, so we use onDblClick for edits and
                  // let the simple onClick keep the selection.
                  visible={editingId !== layer.id}
                  listening={editingId !== layer.id}
                  onClick={() => setSelectedId(layer.id)}
                  onTap={() => setSelectedId(layer.id)}
                  onDblClick={() => setEditingId(layer.id)}
                  onDblTap={() => setEditingId(layer.id)}
                  onDragEnd={(event) =>
                    updateLayer(layer.id, {
                      x: event.target.x(),
                      y: event.target.y(),
                    })
                  }
                  onTransformEnd={(event) => {
                    // Text is treated as a fixed-font, word-wrapped box.
                    // Horizontal scaling grows the wrap width (the
                    // visible "box" resizes); vertical scaling is
                    // ignored — height auto-fits to the wrapped lines.
                    // This matches the Figma/Sketch convention of
                    // resizing the container without re-scaling the
                    // glyphs.
                    const node = event.target;
                    const newWidth = Math.max(80, layer.width * node.scaleX());
                    updateLayer(layer.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: newWidth,
                      scaleX: 1,
                      scaleY: 1,
                    });
                  }}
                />
              ) : layer.kind === "image" ? (
                <CoverImageNode
                  key={layer.id}
                  layer={layer}
                  register={(node) => {
                    if (node === null) {
                      nodeRegistry.current.delete(layer.id);
                      return;
                    }
                    nodeRegistry.current.set(layer.id, node);
                  }}
                  onSelect={() => setSelectedId(layer.id)}
                  onChange={(patch) => updateLayer(layer.id, patch)}
                />
              ) : layer.kind === "chart" ? (
                <CoverChartNode
                  key={layer.id}
                  layer={layer}
                  register={(node) => {
                    if (node === null) {
                      nodeRegistry.current.delete(layer.id);
                      return;
                    }
                    nodeRegistry.current.set(layer.id, node);
                  }}
                  onSelect={() => setSelectedId(layer.id)}
                  onChange={(patch) => updateLayer(layer.id, patch)}
                />
              ) : (
                // TextLayer with a non-text presentation (stars, dots,
                // percent, letter, thermometer, chip).
                <DataVizNode
                  key={layer.id}
                  layer={layer}
                  register={(node) => {
                    if (node === null) {
                      nodeRegistry.current.delete(layer.id);
                      return;
                    }
                    nodeRegistry.current.set(layer.id, node);
                  }}
                  onSelect={() => setSelectedId(layer.id)}
                  onChange={(patch) => updateLayer(layer.id, patch)}
                />
              ),
            )}
            </Group>
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              anchorSize={10}
              borderStroke="#74C69D"
              anchorStroke="#74C69D"
              anchorFill="#FFFFFF"
            />
          </Layer>
        </Stage>
        {editingRect !== null && editingLayer !== null ? (
          <textarea
            value={editingText}
            onChange={(event) => setEditingText(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                commitEditing();
              }
            }}
            autoFocus
            className="absolute z-10 resize-none rounded-sm border-2 border-herb bg-background/95 p-1 text-foreground shadow-lg outline-none"
            style={{
              left: editingRect.x,
              top: editingRect.y,
              width: editingRect.width,
              minHeight: editingRect.height,
              fontSize: (editingLayer.kind === "text" ? editingLayer.fontSize : 16) * displayScale,
              color: editingLayer.kind === "text" ? editingLayer.fill : "#fff",
              fontWeight: editingLayer.kind === "text" && editingLayer.fontStyle === "bold" ? 700 : 400,
              textAlign: editingLayer.kind === "text" ? (editingLayer.align ?? "left") : "left",
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

/** Image layer wrapper — keeps the layer component simple while exposing
 *  the underlying Konva.Image node for the Transformer registry. */
function CoverImageNode({
  layer,
  register,
  onSelect,
  onChange,
}: {
  layer: ImageLayer;
  register: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageLayer>) => void;
}) {
  const img = useHtmlImage(layer.src);
  if (img === null) {
    return (
      <Rect
        ref={register as (node: Konva.Node | null) => void}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        fill="#222"
        cornerRadius={8}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) =>
          onChange({ x: event.target.x(), y: event.target.y() })
        }
        onTransformEnd={(event) => {
          const node = event.target;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
          });
        }}
      />
    );
  }
  return (
    <KonvaImage
      ref={register as (node: Konva.Node | null) => void}
      image={img}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) =>
        onChange({ x: event.target.x(), y: event.target.y() })
      }
      onTransformEnd={(event) => {
        const node = event.target;
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
      }}
    />
  );
}

/** Humanize a tag — "very-calm" → "Very calm". The vocab tags arrive in
 *  kebab/snake from the server; the cover copy stays in display case. */
function humanizeTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      ["thc", "cbd", "og"].includes(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Effects chart layer — one horizontal bar per effect, snapshot of the
 *  session at the moment the user dropped it. The Group is the layer's
 *  bounding node; its transform (x/y/rotation/scale) is what the
 *  Transformer edits, and the inner children stay in local chart space. */
function CoverChartNode({
  layer,
  register,
  onSelect,
  onChange,
}: {
  layer: ChartLayer;
  register: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ChartLayer>) => void;
}) {
  const { t } = useTranslation("coverEditor");
  const W = 600;
  const HEADER = 60;
  const ROW = 44;
  const PAD_X = 24;
  const LABEL_W = 160;
  const BAR_X = PAD_X + LABEL_W;
  const BAR_W = W - BAR_X - 80;
  const H = HEADER + layer.effects.length * ROW;
  const moodColor = "#74C69D";
  const unwantedColor = "#DC2626";
  const track = "#1F2937";
  const label = "#E5E7EB";
  const titleFill = "#FFFFFF";

  return (
    <Group
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) =>
        onChange({ x: event.target.x(), y: event.target.y() })
      }
      onTransformEnd={(event) => {
        const node = event.target;
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
      }}
    >
      <Rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="#0E2418"
        cornerRadius={16}
        stroke="#74C69D"
        strokeWidth={2}
      />
      <Text
        x={PAD_X}
        y={PAD_X}
        text={t("canvas.chartTitle")}
        fontSize={22}
        fontStyle="bold"
        fill={titleFill}
      />
      {layer.effects.map((effect, index) => {
        const rowY = HEADER + index * ROW;
        const intensity = Math.max(1, Math.min(10, effect.intensity));
        const fillColor = effect.type === "mood" ? moodColor : unwantedColor;
        if (layer.presentation === "list") {
          return (
            <Group key={`${effect.tag}-${index}`}>
              <Text
                x={PAD_X}
                y={rowY}
                text={humanizeTag(effect.tag)}
                fontSize={22}
                fill={label}
                width={LABEL_W + 100}
                ellipsis
                wrap="none"
              />
              <Text
                x={W - PAD_X - 80}
                y={rowY}
                text={`${intensity}/10`}
                fontSize={22}
                fontStyle="bold"
                fill={fillColor}
                width={80}
                align="right"
              />
            </Group>
          );
        }
        return (
          <Group key={`${effect.tag}-${index}`}>
            <Text
              x={PAD_X}
              y={rowY}
              text={humanizeTag(effect.tag)}
              fontSize={20}
              fill={label}
              width={LABEL_W}
              ellipsis
              wrap="none"
            />
            <Rect
              x={BAR_X}
              y={rowY + 8}
              width={BAR_W}
              height={14}
              fill={track}
              cornerRadius={7}
            />
            <Rect
              x={BAR_X}
              y={rowY + 8}
              width={(BAR_W * intensity) / 10}
              height={14}
              fill={fillColor}
              cornerRadius={7}
            />
            <Text
              x={BAR_X + BAR_W + 12}
              y={rowY}
              text={`${intensity}/10`}
              fontSize={20}
              fontStyle="bold"
              fill={fillColor}
            />
          </Group>
        );
      })}
    </Group>
  );
}

/** Data visualization node — renders a TextLayer whose `presentation`
 *  is anything other than plain "text". Self-contained Group at
 *  (layer.x, layer.y) with internal coords; the Transformer's scaleX/Y
 *  applies uniformly so the user can resize the whole thing.
 *
 *  Each presentation bakes the session data into the layer at add time
 *  (the layer stores the `text` snapshot, the layer.fontSize sets the
 *  glyph scale, the layer.width sets the row width). */
function DataVizNode({
  layer,
  register,
  onSelect,
  onChange,
}: {
  layer: TextLayer;
  register: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<TextLayer>) => void;
}) {
  const presentation = layer.presentation ?? "text";
  if (presentation === "text") {
    // Plain text — never reach this branch (handled by the Text render);
    // return a no-op Group so the caller still gets a node for the
    // Transformer registry.
    return (
      <Group
        ref={register as (node: Konva.Node | null) => void}
        x={layer.x}
        y={layer.y}
      />
    );
  }
  const W = layer.width;
  const FONT = layer.fontFamily ?? "Inter, system-ui, sans-serif";
  // Rating value: read the baked "X.X/10" string back to a number, or
  // default to 0. The data is captured at add time so the rating is
  // frozen even if the session's rating later changes.
  const ratingMatch = /^([0-9]+(?:\.[0-9]+)?)\/10$/.exec(layer.text);
  const rating = ratingMatch === null ? 0 : Number(ratingMatch[1]);
  const tempMatch = /^(-?[0-9]+)°C$/.exec(layer.text);
  const temp = tempMatch === null ? 0 : Number(tempMatch[1]);

  return (
    <Group
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) =>
        onChange({ x: event.target.x(), y: event.target.y() })
      }
      onTransformEnd={(event) => {
        const node = event.target;
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
      }}
    >
      {presentation === "stars" ? <StarsRow rating={rating} width={W} font={FONT} fill={layer.fill} fontSize={layer.fontSize} /> : null}
      {presentation === "dots" ? <DotsRow rating={rating} width={W} fill={layer.fill} fontSize={layer.fontSize} /> : null}
      {presentation === "percent" ? <PercentBig rating={rating} width={W} font={FONT} fill={layer.fill} fontSize={layer.fontSize} /> : null}
      {presentation === "letter" ? <LetterBig rating={rating} width={W} font={FONT} fill={layer.fill} fontSize={layer.fontSize} /> : null}
      {presentation === "thermometer" ? <ThermometerRow temp={temp} width={W} fontSize={layer.fontSize} font={FONT} fill={layer.fill} /> : null}
      {presentation === "chip" ? <ChipBadge temp={temp} width={W} fontSize={layer.fontSize} font={FONT} fill={layer.fill} /> : null}
    </Group>
  );
}

/** Five stars, filled proportional to rating/2. */
function StarsRow({
  rating,
  width,
  fill,
  font,
  fontSize,
}: {
  rating: number;
  width: number;
  fill: string;
  font: string;
  fontSize: number;
}) {
  const filled = ratingToFive(rating);
  const cell = Math.min(width / 5, fontSize * 1.2);
  const y = 0;
  return (
    <Group>
      {Array.from({ length: 5 }, (_, i) => {
        const isFilled = i + 1 <= Math.floor(filled);
        const isHalf = !isFilled && i + 0.5 <= filled;
        return (
          <Text
            key={i}
            x={i * cell}
            y={y}
            text={isFilled ? "★" : isHalf ? "★" : "☆"}
            fontFamily={font}
            fontSize={cell}
            fill={isFilled || isHalf ? fill : "#6B7280"}
            width={cell}
            height={cell}
            align="center"
          />
        );
      })}
    </Group>
  );
}

/** Five dots (●) filled proportional to rating/2. */
function DotsRow({
  rating,
  width,
  fill,
  fontSize,
}: {
  rating: number;
  width: number;
  fill: string;
  fontSize: number;
}) {
  const filled = ratingToFive(rating);
  const cell = Math.min(width / 5, fontSize * 1.2);
  return (
    <Group>
      {Array.from({ length: 5 }, (_, i) => (
        <Circle
          key={i}
          x={i * cell + cell / 2}
          y={cell / 2}
          radius={cell / 3}
          fill={i + 1 <= Math.floor(filled) ? fill : "#3F3F46"}
          stroke={fill}
          strokeWidth={1.5}
        />
      ))}
    </Group>
  );
}

/** Big percent number ("85%") for the rating. */
function PercentBig({
  rating,
  width,
  font,
  fill,
  fontSize,
}: {
  rating: number;
  width: number;
  font: string;
  fill: string;
  fontSize: number;
}) {
  return (
    <Text
      x={0}
      y={0}
      text={`${Math.round((rating / 10) * 100)}%`}
      fontFamily={font}
      fontSize={fontSize}
      fontStyle="bold"
      fill={fill}
      width={width}
    />
  );
}

/** Big letter grade ("A+") for the rating. */
function LetterBig({
  rating,
  width,
  font,
  fill,
  fontSize,
}: {
  rating: number;
  width: number;
  font: string;
  fill: string;
  fontSize: number;
}) {
  return (
    <Text
      x={0}
      y={0}
      text={ratingToLetter(rating)}
      fontFamily={font}
      fontSize={fontSize}
      fontStyle="bold"
      fill={fill}
      width={width}
    />
  );
}

/** Thermometer visualization: a vertical capsule (track + fill) sized
 *  to the temperature, with the number beside it. Fill is zone-colored. */
function ThermometerRow({
  temp,
  width,
  fontSize,
  font,
  fill,
}: {
  temp: number;
  width: number;
  font: string;
  fill: string;
  fontSize: number;
}) {
  const H = fontSize * 1.2;
  const TRACK_W = Math.max(20, H * 0.35);
  const PCT = Math.max(0, Math.min(1, (temp - 150) / 100));
  const { color: zoneColor } = temperatureZone(temp);
  const textX = TRACK_W + 16;
  return (
    <Group>
      <Rect
        x={0}
        y={0}
        width={TRACK_W}
        height={H}
        fill="#1F2937"
        cornerRadius={TRACK_W / 2}
      />
      <Rect
        x={0}
        y={H * (1 - PCT)}
        width={TRACK_W}
        height={H * PCT}
        fill={zoneColor}
        cornerRadius={TRACK_W / 2}
      />
      <Text
        x={textX}
        y={0}
        text={`${temp}°C`}
        fontFamily={font}
        fontSize={fontSize}
        fontStyle="bold"
        fill={fill}
        width={Math.max(0, width - textX)}
      />
    </Group>
  );
}

/** Pill-shaped chip with the temperature number, zone-colored. */
function ChipBadge({
  temp,
  width,
  fontSize,
  font,
  fill,
}: {
  temp: number;
  width: number;
  font: string;
  fill: string;
  fontSize: number;
}) {
  const H = fontSize * 1.4;
  const PAD = H * 0.5;
  const { color: zoneColor } = temperatureZone(temp);
  return (
    <Group>
      <Rect
        x={0}
        y={0}
        width={width}
        height={H}
        fill={zoneColor}
        cornerRadius={H / 2}
      />
      <Text
        x={PAD}
        y={0}
        text={`${temp}°C`}
        fontFamily={font}
        fontSize={fontSize}
        fontStyle="bold"
        fill={fill}
        width={width - 2 * PAD}
        height={H}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
}
