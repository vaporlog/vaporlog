/*
 * LayersPanel — right-panel tab listing the document layers in stacking
 * order (top layer first). Each row selects the layer and offers the
 * quick toggles: visibility, lock, and one-step z-order moves. All
 * document mutations are dispatched by the page via the handlers.
 */

import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Square,
  Tags,
  Type,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoverLayer } from "./model";

export type LayersPanelProps = {
  layers: CoverLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMove: (id: string, direction: "forward" | "backward") => void;
};

const KIND_ICON = {
  text: Type,
  image: ImageIcon,
  chips: Tags,
  chart: BarChart3,
  shape: Square,
} as const;

export default function LayersPanel({
  layers,
  selectedId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onMove,
}: LayersPanelProps) {
  const { t } = useTranslation("coverEditor");

  const layerLabel = (layer: CoverLayer): string => {
    switch (layer.kind) {
      case "text": {
        const text = layer.text.trim();
        if (text === "") return t("inspector.kind.text");
        return text.length > 18 ? `${text.slice(0, 18)}…` : text;
      }
      case "image":
        return t("inspector.kind.image");
      case "chips":
        return `${layer.tags.length} ${t("inspector.kind.chips")}`;
      case "chart":
        return layer.title?.trim() || t("inspector.kind.chart");
      case "shape":
        // Newer shape kinds (line/triangle/star) fall back to the raw
        // kind until the palette namespace grows their labels.
        return t(`palette.shapes.${layer.shape}`, { defaultValue: layer.shape });
    }
  };

  // Topmost layer first — mirrors the visual stacking on the canvas.
  const ordered = [...layers].reverse();

  if (ordered.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">{t("layers.empty")}</p>;
  }

  return (
    <ul className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
      {ordered.map((layer, index) => {
        const Icon = KIND_ICON[layer.kind];
        const visible = layer.visible ?? true;
        const locked = layer.locked ?? false;
        const selected = layer.id === selectedId;
        return (
          <li
            key={layer.id}
            className={cn(
              "flex items-center gap-0.5 rounded-md pr-0.5",
              selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(layer.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 py-1.5 text-left text-xs"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn("truncate", !visible && "opacity-50")}>
                {layerLabel(layer)}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 pressable"
              onClick={() => onToggleVisible(layer.id)}
              aria-label={t(visible ? "layers.hide" : "layers.show")}
              title={t(visible ? "layers.hide" : "layers.show")}
            >
              {visible ? (
                <Eye className="size-3.5" aria-hidden />
              ) : (
                <EyeOff className="size-3.5" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 pressable"
              onClick={() => onToggleLock(layer.id)}
              aria-label={t(locked ? "layers.unlock" : "layers.lock")}
              title={t(locked ? "layers.unlock" : "layers.lock")}
            >
              {locked ? (
                <Lock className="size-3.5" aria-hidden />
              ) : (
                <LockOpen className="size-3.5" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 pressable"
              disabled={index === 0}
              onClick={() => onMove(layer.id, "forward")}
              aria-label={t("canvas.bringForward")}
              title={t("canvas.bringForward")}
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 pressable"
              disabled={index === ordered.length - 1}
              onClick={() => onMove(layer.id, "backward")}
              aria-label={t("canvas.sendBackward")}
              title={t("canvas.sendBackward")}
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
