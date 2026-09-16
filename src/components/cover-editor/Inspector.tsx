/*
 * Right panel of the cover editor — property inspector for the selected
 * layer. Every attribute of every layer kind is editable here:
 *
 *   text   — content (plain) or data value (rating/temperature/energy),
 *            font size, family, bold/italic, color, alignment
 *   chips  — tag list (add/remove), filled/outline style, accent and
 *            text colors, font size, alignment
 *   shape  — fill, stroke (color + width), corner radius, dimensions
 *   image  — dimensions readout
 *   chart  — title, bar/list presentation, panel color, effect rows
 *   all    — opacity, z-order, duplicate, delete
 *
 * Continuous controls (sliders, color inputs) dispatch with a
 * coalesceKey so one gesture is one undo step; text inputs hold a
 * local draft and commit on blur / Enter.
 */

import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Italic,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FONT_STACKS,
  formatDataValue,
  humanizeTag,
  type ChartLayer,
  type ChipsLayer,
  type CoverLayer,
  type DataKind,
  type ImageLayer,
  type ShapeLayer,
  type TextLayer,
} from "./model";

// ── Shared controls ─────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function ColorField({
  label,
  value,
  onChange,
  coalesceKey,
}: {
  label: string;
  value: string;
  onChange: (value: string, coalesceKey?: string) => void;
  coalesceKey: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value, coalesceKey)}
        className="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        aria-label={label}
      />
    </label>
  );
}

/** Number input with local draft — commits on blur or Enter, reverts
 *  on Escape. Re-syncs when the layer or the value changes externally. */
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // Sync external value changes during render (not in an effect) so the
  // draft follows undo/redo and selection switches without a cascade.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      let next = parsed;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      if (next !== value) onCommit(next);
      else setDraft(String(value));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            setDraft(String(value));
          }
        }}
        className="h-8 w-24 text-right"
        aria-label={label}
      />
    </label>
  );
}

/** Text input with local draft, commit on blur / Enter. */
function TextField({
  label,
  value,
  multiline = false,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
          aria-label={label}
        />
      ) : (
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setDraft(value);
            }
          }}
          className="h-8"
          aria-label={label}
        />
      )}
    </label>
  );
}

function AlignButtons({
  value,
  onChange,
}: {
  value: "left" | "center" | "right";
  onChange: (align: "left" | "center" | "right") => void;
}) {
  const { t } = useTranslation("coverEditor");
  const options = [
    { id: "left" as const, icon: AlignLeft, label: t("canvas.align.left") },
    { id: "center" as const, icon: AlignCenter, label: t("canvas.align.center") },
    { id: "right" as const, icon: AlignRight, label: t("canvas.align.right") },
  ];
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={value === option.id ? "default" : "outline"}
          size="icon"
          onClick={() => onChange(option.id)}
          aria-label={option.label}
          aria-pressed={value === option.id}
          className={cn("pressable", value === option.id && "bg-herb text-herb-foreground herb-hover")}
        >
          <option.icon className="size-4" aria-hidden />
        </Button>
      ))}
    </div>
  );
}

// ── fontStyle helpers ───────────────────────────────────────────────

function hasFontToken(fontStyle: string | undefined, token: "bold" | "italic"): boolean {
  return (fontStyle ?? "normal").split(/\s+/).includes(token);
}

function toggleFontToken(fontStyle: string | undefined, token: "bold" | "italic"): string {
  const tokens = new Set((fontStyle ?? "normal").split(/\s+/).filter((p) => p !== "normal" && p !== ""));
  if (tokens.has(token)) tokens.delete(token);
  else tokens.add(token);
  if (tokens.size === 0) return "normal";
  return ["italic", "bold"].filter((p) => tokens.has(p)).join(" ");
}

// ── Per-kind inspectors ─────────────────────────────────────────────

type UpdateFn = (patch: Partial<CoverLayer>, coalesceKey?: string) => void;

const DATA_RANGES: Record<DataKind, { min: number; max: number; step: number }> = {
  rating: { min: 0, max: 10, step: 0.5 },
  temperature: { min: 100, max: 260, step: 1 },
  energy: { min: -5, max: 5, step: 1 },
};

function TextInspector({ layer, update }: { layer: TextLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  const isData = layer.dataKind !== undefined && layer.presentation !== undefined && layer.presentation !== "text";

  return (
    <>
      {isData && layer.dataKind !== undefined ? (
        <NumberField
          label={t("inspector.text.value")}
          value={layer.dataValue ?? 0}
          {...DATA_RANGES[layer.dataKind]}
          onCommit={(value) =>
            update({
              dataValue: value,
              text: formatDataValue(layer.dataKind as DataKind, value),
            })
          }
        />
      ) : (
        <TextField
          label={t("inspector.text.content")}
          value={layer.text}
          multiline
          onCommit={(text) => update({ text })}
        />
      )}
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("inspector.text.fontSize")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Slider
            value={[layer.fontSize]}
            min={12}
            max={200}
            step={1}
            onValueChange={([value]) => update({ fontSize: value }, `fontSize:${layer.id}`)}
            className="flex-1"
            aria-label={t("inspector.text.fontSize")}
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(layer.fontSize)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("canvas.fontFamily")}</FieldLabel>
        <Select
          value={layer.fontFamily ?? FONT_STACKS.sans}
          onValueChange={(value) => update({ fontFamily: value })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FONT_STACKS).map(([key, stack]) => (
              <SelectItem key={key} value={stack}>
                <span style={{ fontFamily: stack }}>{t(`canvas.fonts.${key}`)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={hasFontToken(layer.fontStyle, "bold") ? "default" : "outline"}
            size="icon"
            onClick={() => update({ fontStyle: toggleFontToken(layer.fontStyle, "bold") })}
            aria-label={t("canvas.bold")}
            aria-pressed={hasFontToken(layer.fontStyle, "bold")}
            className={cn("pressable", hasFontToken(layer.fontStyle, "bold") && "bg-herb text-herb-foreground herb-hover")}
          >
            <Bold className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant={hasFontToken(layer.fontStyle, "italic") ? "default" : "outline"}
            size="icon"
            onClick={() => update({ fontStyle: toggleFontToken(layer.fontStyle, "italic") })}
            aria-label={t("canvas.italic")}
            aria-pressed={hasFontToken(layer.fontStyle, "italic")}
            className={cn("pressable", hasFontToken(layer.fontStyle, "italic") && "bg-herb text-herb-foreground herb-hover")}
          >
            <Italic className="size-4" aria-hidden />
          </Button>
        </div>
        <AlignButtons
          value={layer.align ?? "left"}
          onChange={(align) => update({ align })}
        />
      </div>
      <ColorField
        label={t("inspector.text.color")}
        value={layer.fill}
        onChange={(fill, key) => update({ fill }, key)}
        coalesceKey={`fill:${layer.id}`}
      />
    </>
  );
}

function ChipsInspector({ layer, update }: { layer: ChipsLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (tag === "" || layer.tags.includes(tag)) return;
    update({ tags: [...layer.tags, tag] });
    setNewTag("");
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("inspector.chips.tags")}</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {layer.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs"
            >
              {humanizeTag(tag)}
              <button
                type="button"
                onClick={() => update({ tags: layer.tags.filter((entry) => entry !== tag) })}
                aria-label={t("inspector.chips.removeTag", { tag: humanizeTag(tag) })}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder={t("inspector.chips.addTag")}
            className="h-8 flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag} className="pressable">
            {t("inspector.chips.add")}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("inspector.chips.style")}</span>
        <div className="flex gap-1">
          {(["filled", "outline"] as const).map((style) => (
            <Button
              key={style}
              type="button"
              variant={layer.chipStyle === style ? "default" : "outline"}
              size="sm"
              onClick={() => update({ chipStyle: style })}
              aria-pressed={layer.chipStyle === style}
              className={cn("pressable", layer.chipStyle === style && "bg-herb text-herb-foreground herb-hover")}
            >
              {t(`inspector.chips.${style}`)}
            </Button>
          ))}
        </div>
      </div>
      <ColorField
        label={t("inspector.chips.accent")}
        value={layer.accent}
        onChange={(accent, key) => update({ accent }, key)}
        coalesceKey={`accent:${layer.id}`}
      />
      <ColorField
        label={t("inspector.chips.textColor")}
        value={layer.textColor}
        onChange={(textColor, key) => update({ textColor }, key)}
        coalesceKey={`textColor:${layer.id}`}
      />
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("inspector.text.fontSize")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Slider
            value={[layer.fontSize]}
            min={14}
            max={80}
            step={1}
            onValueChange={([value]) => update({ fontSize: value }, `fontSize:${layer.id}`)}
            className="flex-1"
            aria-label={t("inspector.text.fontSize")}
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(layer.fontSize)}
          </span>
        </div>
      </div>
      <AlignButtons value={layer.align ?? "left"} onChange={(align) => update({ align })} />
    </>
  );
}

function ShapeInspector({ layer, update }: { layer: ShapeLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  const hasStroke = layer.stroke !== undefined;

  return (
    <>
      <ColorField
        label={t("inspector.shape.fill")}
        value={layer.fill}
        onChange={(fill, key) => update({ fill }, key)}
        coalesceKey={`fill:${layer.id}`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("inspector.shape.stroke")}</span>
        <div className="flex items-center gap-2">
          {hasStroke ? (
            <input
              type="color"
              value={layer.stroke}
              onChange={(event) => update({ stroke: event.target.value }, `stroke:${layer.id}`)}
              className="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              aria-label={t("inspector.shape.stroke")}
            />
          ) : null}
          <Button
            type="button"
            variant={hasStroke ? "default" : "outline"}
            size="sm"
            onClick={() =>
              update(
                hasStroke
                  ? { stroke: undefined, strokeWidth: undefined }
                  : { stroke: "#FFFFFF", strokeWidth: 4 },
              )
            }
            aria-pressed={hasStroke}
            className={cn("pressable", hasStroke && "bg-herb text-herb-foreground herb-hover")}
          >
            {hasStroke ? t("inspector.shape.strokeOn") : t("inspector.shape.strokeOff")}
          </Button>
        </div>
      </div>
      {hasStroke ? (
        <NumberField
          label={t("inspector.shape.strokeWidth")}
          value={layer.strokeWidth ?? 2}
          min={1}
          max={40}
          onCommit={(strokeWidth) => update({ strokeWidth })}
        />
      ) : null}
      {layer.shape === "rect" ? (
        <NumberField
          label={t("inspector.shape.cornerRadius")}
          value={layer.cornerRadius ?? 0}
          min={0}
          max={200}
          onCommit={(cornerRadius) => update({ cornerRadius })}
        />
      ) : null}
      <NumberField
        label={t("inspector.shape.width")}
        value={Math.round(layer.width)}
        min={8}
        max={2400}
        onCommit={(width) => update({ width })}
      />
      <NumberField
        label={t("inspector.shape.height")}
        value={Math.round(layer.height)}
        min={8}
        max={2400}
        onCommit={(height) => update({ height })}
      />
    </>
  );
}

function ImageInspector({ layer }: { layer: ImageLayer }) {
  const { t } = useTranslation("coverEditor");
  return (
    <p className="text-xs text-muted-foreground">
      {t("inspector.image.dimensions", {
        width: Math.round(layer.width * layer.scaleX),
        height: Math.round(layer.height * layer.scaleY),
      })}
    </p>
  );
}

function ChartInspector({ layer, update }: { layer: ChartLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  return (
    <>
      <TextField
        label={t("inspector.chart.title")}
        value={layer.title ?? ""}
        onCommit={(title) => update({ title: title === "" ? undefined : title })}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("inspector.chart.presentation")}</span>
        <div className="flex gap-1">
          {(["bar", "list"] as const).map((presentation) => (
            <Button
              key={presentation}
              type="button"
              variant={(layer.presentation ?? "bar") === presentation ? "default" : "outline"}
              size="sm"
              onClick={() => update({ presentation })}
              aria-pressed={(layer.presentation ?? "bar") === presentation}
              className={cn(
                "pressable",
                (layer.presentation ?? "bar") === presentation && "bg-herb text-herb-foreground herb-hover",
              )}
            >
              {t(`canvas.effects.${presentation}`)}
            </Button>
          ))}
        </div>
      </div>
      <ColorField
        label={t("inspector.chart.panelColor")}
        value={layer.panelColor ?? "#0E2418"}
        onChange={(panelColor, key) => update({ panelColor }, key)}
        coalesceKey={`panel:${layer.id}`}
      />
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("inspector.chart.effects")}</FieldLabel>
        <div className="flex flex-col gap-0.5">
          {layer.effects.map((effect, index) => (
            <div
              key={`${effect.tag}-${index}`}
              className="flex items-center justify-between gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <span className="truncate">{humanizeTag(effect.tag)}</span>
              <span className="flex items-center gap-1">
                <span className="tabular-nums text-muted-foreground">{effect.intensity}/10</span>
                <button
                  type="button"
                  onClick={() =>
                    update({ effects: layer.effects.filter((_, i) => i !== index) })
                  }
                  aria-label={t("inspector.chips.removeTag", { tag: humanizeTag(effect.tag) })}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Inspector root ──────────────────────────────────────────────────

export default function CoverInspector({
  layer,
  onUpdate,
  onMove,
  onDuplicate,
  onDelete,
}: {
  layer: CoverLayer | null;
  onUpdate: (id: string, patch: Partial<CoverLayer>, coalesceKey?: string) => void;
  onMove: (id: string, direction: "forward" | "backward" | "top" | "bottom") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("coverEditor");

  if (layer === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-center text-xs text-muted-foreground">{t("inspector.empty")}</p>
      </div>
    );
  }

  const update: UpdateFn = (patch, coalesceKey) => onUpdate(layer.id, patch, coalesceKey);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <p className="text-sm font-semibold">{t(`inspector.kind.${layer.kind}`)}</p>

        {layer.kind === "text" ? <TextInspector layer={layer} update={update} /> : null}
        {layer.kind === "chips" ? <ChipsInspector layer={layer} update={update} /> : null}
        {layer.kind === "shape" ? <ShapeInspector layer={layer} update={update} /> : null}
        {layer.kind === "image" ? <ImageInspector layer={layer} /> : null}
        {layer.kind === "chart" ? <ChartInspector layer={layer} update={update} /> : null}

        <Separator />

        {/* Common: opacity + z-order + duplicate/delete */}
        <div className="flex flex-col gap-1">
          <FieldLabel>{t("inspector.opacity")}</FieldLabel>
          <div className="flex items-center gap-2">
            <Slider
              value={[Math.round((layer.opacity ?? 1) * 100)]}
              min={5}
              max={100}
              step={1}
              onValueChange={([value]) => update({ opacity: value / 100 }, `opacity:${layer.id}`)}
              className="flex-1"
              aria-label={t("inspector.opacity")}
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round((layer.opacity ?? 1) * 100)}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(layer.id, "forward")}
            className="pressable"
          >
            <ChevronUp className="size-4" aria-hidden />
            {t("canvas.bringForward")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(layer.id, "backward")}
            className="pressable"
          >
            <ChevronDown className="size-4" aria-hidden />
            {t("canvas.sendBackward")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDuplicate(layer.id)}
            className="pressable"
          >
            <Copy className="size-4" aria-hidden />
            {t("canvas.duplicate")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDelete(layer.id)}
            className="pressable text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("canvas.delete")}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
