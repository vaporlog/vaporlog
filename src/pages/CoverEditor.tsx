import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Stage, Layer, Group, Rect, Transformer } from "react-konva";
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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { apiFetch, getToken } from "@/lib/api";
import {
  displayDeviceName,
  displayStrainName,
} from "@/components/session-card/display";
import { useMySessions } from "@/lib/data";
import CoverPalette from "@/components/cover-editor/Palette";
import CoverInspector from "@/components/cover-editor/Inspector";
import {
  CoverChartNode,
  CoverChipsNode,
  CoverImageNode,
  CoverShapeNode,
  CoverTextNode,
  DataVizNode,
} from "@/components/cover-editor/nodes";
import { historyReducer, INITIAL_HISTORY } from "@/components/cover-editor/history";
import {
  BG_COLOR,
  buildImageLayer,
  buildTextLayer,
  CANVAS_H,
  CANVAS_W,
  DEFAULT_FONT,
  EXPORT_PRESETS,
  findExportPresetId,
  parseCoverDoc,
  rebindDoc,
  renderCoverToSize,
  serializeCoverDoc,
  type BackgroundFill,
  type CoverLayer,
  type ExportSize,
} from "@/components/cover-editor/model";

/*
 * /s/:id/edit-cover — Canva-style cover editor (custom OG card).
 *
 * Shell around the cover-editor modules:
 *   - left panel   CoverPalette   — everything that can drop on the canvas
 *   - center       Konva Stage    — the 1200×630 design, letterboxed into
 *                                   the chosen export aspect
 *   - right panel  CoverInspector — properties of the selected layer
 * Document state (layers + background) lives in the undo/redo history
 * reducer; selection and inline text editing are transient UI state.
 *
 * Desktop (lg+) lays the three regions out as resizable panels; below lg
 * the canvas comes first and the panels stack under it. On lg the editor
 * also breaks out of AppLayout's max-w-3xl column so the canvas gets
 * real room.
 */

/** Tracks a media query as reactive state (layout switch at lg). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function CoverEditor() {
  const { t } = useTranslation("coverEditor");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { sessions, loading } = useMySessions();
  const session = useMemo(
    () => sessions.find((entry) => entry.id === id) ?? null,
    [sessions, id],
  );

  const [historyState, dispatch] = useReducer(historyReducer, INITIAL_HISTORY);
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
   *  the chosen background color. */
  const [exportSize, setExportSize] = useState<ExportSize>({
    width: CANVAS_W,
    height: CANVAS_H,
  });
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRegistry = useRef<Map<string, Konva.Node>>(new Map());

  // Auth gate: not signed in → back to welcome. Owner check happens once
  // the session list resolves; an unknown id lands in the same "not owner"
  // branch so we never confirm whether the session exists.
  useEffect(() => {
    if (getToken() === null) {
      void navigate(`/welcome?next=/s/${id}/edit-cover`, { replace: true });
    }
  }, [navigate, id]);

  // Seed the canvas the first time the session resolves: restore the
  // persisted doc when the session already has one, otherwise drop the
  // default layout (strain / rating / device·temp) so the owner has
  // something to react to. Skips if they already started editing.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (session === null || seededRef.current === session.id) return;
    if (layers.length > 0) {
      seededRef.current = session.id;
      return;
    }
    const doc = parseCoverDoc(session.customOgDoc);
    if (doc !== null) {
      dispatch({
        type: "reset_with",
        layers: doc.layers,
        background: doc.background,
      });
    } else {
      const deviceName = displayDeviceName(session.deviceSlug);
      dispatch({
        type: "reset_with",
        background: "night",
        layers: [
          buildTextLayer({
            text: displayStrainName(session.strainSlug),
            x: 80,
            y: 200,
            fontSize: 120,
            fill: "#74C69D",
            fontStyle: "bold",
            width: 1040,
            bind: "strain",
          }),
          buildTextLayer({
            text: `${session.rating.toFixed(1)}/10`,
            x: 80,
            y: 360,
            fontSize: 72,
            fill: "#FFFFFF",
            width: 600,
            dataKind: "rating",
            dataValue: session.rating,
          }),
          buildTextLayer({
            text: [
              deviceName,
              session.temperatureC === null
                ? null
                : `${session.temperatureC}°C`,
            ]
              .filter(Boolean)
              .join(" · "),
            x: 80,
            y: 480,
            fontSize: 36,
            fill: "#9BA3A0",
            width: 1040,
            bind: "deviceTemp",
          }),
        ],
      });
    }
    seededRef.current = session.id;
  }, [session, layers.length]);

  // Keep the Transformer pinned to the selected node. The registry is
  // populated by each layer's ref callback so the transformer can find
  // the node without us threading refs through props.
  useEffect(() => {
    const tr = transformerRef.current;
    if (tr === null) return;
    const node = selectedId === null ? undefined : nodeRegistry.current.get(selectedId);
    tr.nodes(node === undefined ? [] : [node]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers]);

  const registerNode = useCallback(
    (layerId: string) => (node: Konva.Node | null) => {
      if (node === null) {
        nodeRegistry.current.delete(layerId);
        return;
      }
      nodeRegistry.current.set(layerId, node);
    },
    [],
  );

  // ── Layer mutations ───────────────────────────────────────────────

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<CoverLayer>, coalesceKey?: string) => {
      dispatch({ type: "update_layer", id: layerId, patch, coalesceKey });
    },
    [],
  );

  const addLayer = useCallback((layer: CoverLayer) => {
    dispatch({ type: "add_layer", layer });
    setSelectedId(layer.id);
  }, []);

  const deleteLayer = useCallback(
    (layerId: string) => {
      dispatch({ type: "delete_layer", id: layerId });
      setSelectedId((current) => (current === layerId ? null : current));
    },
    [],
  );

  const duplicateLayer = useCallback((layerId: string) => {
    dispatch({ type: "duplicate_layer", id: layerId });
  }, []);

  const moveLayer = useCallback(
    (layerId: string, direction: "forward" | "backward" | "top" | "bottom") => {
      dispatch({ type: "move_layer", id: layerId, direction });
    },
    [],
  );

  const setBackground = useCallback((fill: BackgroundFill) => {
    dispatch({ type: "set_background", background: fill });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "clear_all" });
    setSelectedId(null);
  }, []);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  /** Arrow-key nudge: 1px per press, 10px with Shift. Coalesced per
   *  layer so a held key is one undo step per streak break. */
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedId === null) return;
      const layer = layers.find((entry) => entry.id === selectedId);
      if (layer === undefined) return;
      dispatch({
        type: "update_layer",
        id: layer.id,
        patch: { x: layer.x + dx, y: layer.y + dy },
        coalesceKey: `nudge:${layer.id}`,
      });
    },
    [selectedId, layers],
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
        addLayer(
          buildImageLayer({
            src,
            width,
            height,
            x: (CANVAS_W - width) / 2,
            y: (CANVAS_H - height) / 2,
          }),
        );
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }, [addLayer]);

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
      const src = reader.result;
      const probe = new window.Image();
      probe.onload = () => {
        const targetHeight = 240;
        const scale = targetHeight / probe.naturalHeight;
        const width = Math.round(probe.naturalWidth * scale);
        const height = targetHeight;
        addLayer(
          buildImageLayer({
            src,
            width,
            height,
            x: CANVAS_W - width - 80,
            y: CANVAS_H - height - 80,
          }),
        );
      };
      probe.src = src;
    };
    reader.readAsDataURL(blob);
  }, [t, addLayer]);

  // ── My covers (templates from saved covers) ───────────────────────
  // Every session with a saved custom cover shows up in the palette
  // gallery; the one being edited goes first.
  const covers = useMemo(
    () =>
      sessions
        .filter((entry) => entry.customOgImage != null)
        .map((entry) => ({
          sessionId: entry.id,
          caption: `${displayStrainName(entry.strainSlug)} · ${entry.rating.toFixed(1)}`,
          hasDoc: parseCoverDoc(entry.customOgDoc) !== null,
          isCurrent: entry.id === id,
        }))
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
    [sessions, id],
  );

  /** Applies a saved cover as a template: a stored doc keeps its design
   *  and re-binds data layers to THIS session; an image-only cover is
   *  flattened to a single full-canvas image layer. */
  const applyTemplate = useCallback(
    async (sessionId: string) => {
      if (session === null) return;
      const source = sessions.find((entry) => entry.id === sessionId);
      if (source === undefined) return;
      const doc = parseCoverDoc(source.customOgDoc);
      if (doc !== null) {
        dispatch({
          type: "replace_doc",
          ...rebindDoc(doc, {
            session,
            strainName: displayStrainName(session.strainSlug),
            deviceName: displayDeviceName(session.deviceSlug),
            t,
          }),
        });
      } else {
        const token = getToken();
        const headers: Record<string, string> = {};
        if (token !== null) headers.Authorization = `Bearer ${token}`;
        try {
          const response = await fetch(`/api/og/s/${sessionId}/card.png`, { headers });
          if (!response.ok) throw new Error(`cover ${response.status}`);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") resolve(reader.result);
              else reject(new Error("cover read failed"));
            };
            reader.onerror = () => reject(new Error("cover read failed"));
            reader.readAsDataURL(blob);
          });
          dispatch({
            type: "replace_doc",
            background: "solid",
            layers: [
              buildImageLayer({
                src: dataUrl,
                width: CANVAS_W,
                height: CANVAS_H,
                x: 0,
                y: 0,
              }),
            ],
          });
        } catch {
          toast.error(t("save.error"));
          return;
        }
      }
      setSelectedId(null);
      toast.success(t("gallery.applied"));
    },
    [session, sessions, t],
  );

  // ── Inline text editing overlay ───────────────────────────────────
  // Local draft for the textarea — committed back to the layer (and
  // pushed to history) only on blur or Ctrl/Cmd+Enter, so undo doesn't
  // capture every keystroke. The Konva.Text node is hidden while editing
  // so the overlay is the only visible representation of the text.
  const [editingText, setEditingText] = useState<string>("");
  useEffect(() => {
    if (editingId === null) return;
    const layer = layers.find((entry) => entry.id === editingId);
    setEditingText(layer?.kind === "text" ? layer.text : "");
  }, [editingId, layers]);

  // The canvas wrapper's display size follows the export aspect ratio
  // (selected via the size picker). The design itself always lives in
  // CANVAS_W × CANVAS_H; the wrapper's CSS aspect-ratio + a uniform
  // scale letterbox the design inside whatever frame the user picked,
  // with the chosen background color filling the rest.
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
    // isDesktop: the wrapper node is a different element per layout
    // branch — re-measure when the branch swaps.
  }, [exportSize.width, exportSize.height, isDesktop]);

  // Uniform scale — the design fits the wrapper without distortion. The
  // background color fills the letterbox area.
  const displayScale =
    displaySize.width > 0 && displaySize.height > 0
      ? Math.min(displaySize.width / CANVAS_W, displaySize.height / CANVAS_H)
      : 0;
  // Letterbox offset of the design inside the stage, in design pixels.
  // When the export aspect matches the design (1200:630), this is (0,0).
  const designOffsetX =
    displayScale > 0 ? (displaySize.width / displayScale - CANVAS_W) / 2 : 0;
  const designOffsetY =
    displayScale > 0 ? (displaySize.height / displayScale - CANVAS_H) / 2 : 0;

  const editingLayer =
    editingId === null
      ? null
      : layers.find((entry) => entry.id === editingId) ?? null;

  /** Measure the editing text node in screen coords. Konva scales the
   *  stage canvas by `displayScale` (display / design), so the rect
   *  returned by getClientRect is in design space and needs to be
   *  multiplied by that scale. The whole design sits inside a Group
   *  with a letterbox offset (designOffsetX/Y), which is added before
   *  the scale so the textarea lands on the visible design. */
  const editingRect = useMemo(() => {
    if (editingLayer === null) return null;
    const node = nodeRegistry.current.get(editingLayer.id);
    if (node === null || node === undefined) return null;
    const stage = node.getStage();
    if (stage === null) return null;
    const nodeRect = node.getClientRect({ relativeTo: stage });
    const scaleX = stage.scaleX();
    const scaleY = stage.scaleY();
    return {
      x: (designOffsetX + nodeRect.x) * scaleX,
      y: (designOffsetY + nodeRect.y) * scaleY,
      width: Math.max(80, nodeRect.width * scaleX),
      height: Math.max(40, nodeRect.height * scaleY),
    };
  }, [editingLayer, designOffsetX, designOffsetY]);

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
  // Esc cancels inline edit / deselects; Delete/Backspace removes the
  // selected layer; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo;
  // arrows nudge the selected layer (1px, 10px with Shift). Bound on
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
        deleteLayer(selectedId);
      } else if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        if (selectedId === null) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx =
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy =
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        nudgeSelected(dx, dy);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, selectedId, cancelEditing, deleteLayer, nudgeSelected]);

  // ── Save / restore ────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const stage = stageRef.current;
    if (stage === null || saving) return;
    setSaving(true);
    // Commit any in-flight inline edit and drop the selection, then
    // defer a frame so the transformer / selection rect disappear from
    // the export — otherwise the handles ship in the PNG.
    if (editingId !== null) commitEditing();
    setSelectedId(null);
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
          : await renderCoverToSize(designDataUrl, exportSize, BG_COLOR[background]);
      await apiFetch(`/sessions/${id}/custom-og`, {
        method: "POST",
        body: {
          image: dataUrl,
          doc: serializeCoverDoc(background, layers),
        },
        auth: true,
      });
      toast.success(t("save.success"));
    } catch (error) {
      const message =
        (error as Error).message === "" ? t("save.error") : (error as Error).message;
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [id, saving, t, exportSize, background, layers, editingId, commitEditing]);

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

  const strainName = displayStrainName(session.strainSlug);
  const selectedLayer = layers.find((entry) => entry.id === selectedId) ?? null;
  const canSave = layers.length > 0 && !saving;

  /** The canvas block. `maxHeight` differs per layout branch: on mobile
   *  it's capped against the viewport; in the desktop panel it just
   *  fills the panel (the design letterboxes inside whatever box the
   *  measurement finds). Plain function, not a component — calling it
   *  inline keeps reconciliation stable across renders. */
  const renderCanvas = (maxHeight: string) => (
    <div
      ref={canvasWrapRef}
      className="relative w-full overflow-hidden rounded-xl border border-border shadow-sm"
      style={{
        maxWidth: CANVAS_W,
        maxHeight,
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
          {/* Single Group wraps the whole design so it can be re-centered
              inside the export frame when the user picks a different
              aspect ratio. designOffsetX/Y are in design pixels. */}
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
            {layers.map((layer) => {
              const register = registerNode(layer.id);
              const onSelect = () => setSelectedId(layer.id);
              if (layer.kind === "text") {
                if (layer.presentation === undefined || layer.presentation === "text") {
                  return (
                    <CoverTextNode
                      key={layer.id}
                      layer={layer}
                      register={register}
                      onSelect={onSelect}
                      hidden={editingId === layer.id}
                      onEdit={() => setEditingId(layer.id)}
                      onChange={(patch) => updateLayer(layer.id, patch)}
                    />
                  );
                }
                // Data-backed presentations (stars, thermometer, gauge…).
                return (
                  <DataVizNode
                    key={layer.id}
                    layer={layer}
                    register={register}
                    onSelect={onSelect}
                    onChange={(patch) => updateLayer(layer.id, patch)}
                  />
                );
              }
              if (layer.kind === "image") {
                return (
                  <CoverImageNode
                    key={layer.id}
                    layer={layer}
                    register={register}
                    onSelect={onSelect}
                    onChange={(patch) => updateLayer(layer.id, patch)}
                  />
                );
              }
              if (layer.kind === "chips") {
                return (
                  <CoverChipsNode
                    key={layer.id}
                    layer={layer}
                    register={register}
                    onSelect={onSelect}
                    onChange={(patch) => updateLayer(layer.id, patch)}
                  />
                );
              }
              if (layer.kind === "shape") {
                return (
                  <CoverShapeNode
                    key={layer.id}
                    layer={layer}
                    register={register}
                    onSelect={onSelect}
                    onChange={(patch) => updateLayer(layer.id, patch)}
                  />
                );
              }
              return (
                <CoverChartNode
                  key={layer.id}
                  layer={layer}
                  register={register}
                  onSelect={onSelect}
                  onChange={(patch) => updateLayer(layer.id, patch)}
                />
              );
            })}
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
          style={(() => {
            const fontStyle =
              editingLayer.kind === "text" ? (editingLayer.fontStyle ?? "normal") : "normal";
            const tokens = fontStyle.split(/\s+/);
            return {
              left: editingRect.x,
              top: editingRect.y,
              width: editingRect.width,
              minHeight: editingRect.height,
              fontSize:
                (editingLayer.kind === "text" ? editingLayer.fontSize : 16) * displayScale,
              // The overlay mirrors the layer's full typography — the old
              // editor only mapped fontStyle === "bold" and dropped both
              // fontFamily and italic, so the textarea never matched the
              // canvas for styled layers.
              fontFamily:
                editingLayer.kind === "text"
                  ? (editingLayer.fontFamily ?? DEFAULT_FONT)
                  : DEFAULT_FONT,
              fontWeight: tokens.includes("bold") ? 700 : 400,
              fontStyle: tokens.includes("italic") ? "italic" : "normal",
              color: editingLayer.kind === "text" ? editingLayer.fill : "#fff",
              textAlign: editingLayer.kind === "text" ? (editingLayer.align ?? "left") : "left",
            };
          })()}
        />
      ) : null}
    </div>
  );

  const palette = (
    <CoverPalette
      session={session}
      background={background}
      covers={covers}
      onApplyTemplate={(sessionId) => void applyTemplate(sessionId)}
      onAddLayer={addLayer}
      onAddImageFile={addImageFromFile}
      onAddMascot={() => void addMascot()}
      onBackground={setBackground}
    />
  );

  const inspector = (
    <CoverInspector
      layer={selectedLayer}
      onUpdate={updateLayer}
      onMove={moveLayer}
      onDuplicate={duplicateLayer}
      onDelete={deleteLayer}
    />
  );

  return (
    <section className="flex flex-col gap-3">
      <Toaster />

      {/* Editor header: navigation, history, canvas-wide actions, export
          size, restore, save. Wraps into two rows on narrow screens. */}
      <header className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="pressable">
          <Link to={`/s/${session.id}`}>
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Link>
        </Button>
        <div className="mr-auto flex min-w-0 flex-col">
          <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {strainName} · {session.rating.toFixed(1)}/10
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canUndo}
            onClick={undo}
            aria-label={t("canvas.undo")}
            title={t("canvas.undo")}
            className="pressable"
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canRedo}
            onClick={redo}
            aria-label={t("canvas.redo")}
            title={t("canvas.redo")}
            className="pressable"
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={layers.length === 0}
                aria-label={t("canvas.clearAll")}
                title={t("canvas.clearAll")}
                className="pressable"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("clear.title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("clear.body")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="pressable">
                  {t("clear.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={clearAll} className="pressable">
                  {t("clear.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-2">
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
                  <AlertDialogTitle>{t("restore.confirmTitle")}</AlertDialogTitle>
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
      </header>

      <p className="text-xs text-muted-foreground">{t("subtitle")}</p>

      {isDesktop ? (
        // Break out of AppLayout's max-w-3xl column: the editor needs
        // real width for three regions. Centered via left-1/2 +
        // -translate-x-1/2 against the (page-centered) main column.
        <div className="relative left-1/2 w-[min(calc(100vw-2rem),1440px)] -translate-x-1/2">
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-[calc(100dvh-16rem)] min-h-[520px] overflow-hidden rounded-xl border border-border"
          >
            <ResizablePanel defaultSize="21%" minSize="14%" maxSize="40%">
              <div className="h-full overflow-hidden">{palette}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="57%" minSize="30%">
              <div className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden p-3">
                {renderCanvas("100%")}
                <p className="shrink-0 text-center text-xs text-muted-foreground">
                  {t("keyboardHints")}
                </p>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="22%" minSize="16%" maxSize="40%">
              <div className="h-full overflow-hidden">{inspector}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        // Narrow screens: canvas first, panels stacked under it.
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-2">
            {renderCanvas("calc(100dvh - 320px)")}
            <p className="text-center text-xs text-muted-foreground">
              {t("keyboardHints")}
            </p>
          </div>
          <div className="h-[22rem] overflow-hidden rounded-xl border border-border">
            {palette}
          </div>
          <div className="h-[18rem] overflow-hidden rounded-xl border border-border">
            {inspector}
          </div>
        </div>
      )}
    </section>
  );
}
