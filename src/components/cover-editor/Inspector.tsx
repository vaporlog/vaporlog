/*
 * Right panel of the cover editor — property inspector for the selected
 * layer. Every attribute of every layer kind is editable here:
 *
 *   text   — content (plain) or data value (rating/temperature/energy),
 *            font size, family, bold/italic, color, alignment,
 *            letter spacing, line height, shadow, outline
 *   chips  — tag list (add/remove), filled/outline style, accent and
 *            text colors, font size, alignment
 *   shape  — fill, stroke (color + width), corner radius, dimensions, flip
 *   image  — dimensions readout, corner radius, filters, flip
 *   chart  — title, bar/list presentation, panel color, effect rows
 *   all    — position (x/y/rotation), canvas alignment, opacity, z-order,
 *            duplicate, delete
 *
 * Continuous controls (sliders, color inputs) dispatch with a
 * coalesceKey so one gesture is one undo step; text inputs hold a
 * local draft and commit on blur / Enter.
 */

import { useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
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
import { Switch } from "@/components/ui/switch";
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

/** Canvas-edge alignment requested from the inspector; the page
 *  resolves it against the selected node's real rect. */
export type CanvasAlign = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/** Labeled slider with a numeric readout — the standard continuous
 *  control of the inspector. The caller supplies the coalesceKey by
 *  wrapping onChange. */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => onChange(next)}
          className="flex-1"
          aria-label={label}
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {format !== undefined ? format(value) : Math.round(value)}
        </span>
      </div>
    </div>
  );
}

/** Small pressed-state button used for boolean toggles that carry their
 *  own label (flip, grayscale, sepia…). */
function ToggleButton({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "default" : "outline"}
      size="sm"
      onClick={onToggle}
      aria-pressed={pressed}
      className={cn("pressable", pressed && "bg-herb text-herb-foreground herb-hover")}
    >
      {label}
    </Button>
  );
}

/** Horizontal/vertical flip pair shared by the image and shape inspectors. */
function FlipButtons({
  layer,
  update,
}: {
  layer: { flipX?: boolean; flipY?: boolean };
  update: UpdateFn;
}) {
  const { t } = useTranslation("coverEditor");
  return (
    <div className="flex gap-1">
      <ToggleButton
        label={t("inspector.flipX")}
        pressed={layer.flipX ?? false}
        onToggle={() => update({ flipX: !(layer.flipX ?? false) })}
      />
      <ToggleButton
        label={t("inspector.flipY")}
        pressed={layer.flipY ?? false}
        onToggle={() => update({ flipY: !(layer.flipY ?? false) })}
      />
    </div>
  );
}

/** Absolute x/y/rotation numeric fields — common to every layer kind. */
function PositionSection({ layer, update }: { layer: CoverLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{t("inspector.position.title")}</FieldLabel>
      <NumberField
        label={t("inspector.position.x")}
        value={Math.round(layer.x)}
        step={1}
        onCommit={(x) => update({ x })}
      />
      <NumberField
        label={t("inspector.position.y")}
        value={Math.round(layer.y)}
        step={1}
        onCommit={(y) => update({ y })}
      />
      <NumberField
        label={t("inspector.position.rotation")}
        value={Math.round(layer.rotation)}
        min={0}
        max={360}
        step={1}
        onCommit={(rotation) => update({ rotation })}
      />
    </div>
  );
}

/** Snap the selected layer to the canvas edges/centers. The page owns
 *  the geometry (it reads the real node rect); this only forwards the
 *  requested alignment. */
function CanvasAlignSection({ onAlign }: { onAlign: (align: CanvasAlign) => void }) {
  const { t } = useTranslation("coverEditor");
  const options = [
    { id: "left" as const, icon: AlignStartVertical, label: t("inspector.align.left") },
    { id: "centerX" as const, icon: AlignCenterVertical, label: t("inspector.align.centerX") },
    { id: "right" as const, icon: AlignEndVertical, label: t("inspector.align.right") },
    { id: "top" as const, icon: AlignStartHorizontal, label: t("inspector.align.top") },
    { id: "centerY" as const, icon: AlignCenterHorizontal, label: t("inspector.align.centerY") },
    { id: "bottom" as const, icon: AlignEndHorizontal, label: t("inspector.align.bottom") },
  ];
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{t("inspector.align.label")}</FieldLabel>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onAlign(option.id)}
            aria-label={option.label}
            className="pressable"
          >
            <option.icon className="size-4" aria-hidden />
          </Button>
        ))}
      </div>
    </div>
  );
}

const DATA_RANGES: Record<DataKind, { min: number; max: number; step: number }> = {
  rating: { min: 0, max: 10, step: 0.5 },
  temperature: { min: 100, max: 260, step: 1 },
  energy: { min: -5, max: 5, step: 1 },
};

/** Applied when the text-shadow switch turns on. */
const DEFAULT_TEXT_SHADOW = { color: "#000000", blur: 10, offsetX: 0, offsetY: 4 };

function TextInspector({ layer, update }: { layer: TextLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  const isData = layer.dataKind !== undefined && layer.presentation !== undefined && layer.presentation !== "text";
  // Const local so the shadow narrowing survives inside onChange closures.
  const shadow = layer.shadow;

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
      <SliderField
        label={t("inspector.text.letterSpacing")}
        value={layer.letterSpacing ?? 0}
        min={-5}
        max={40}
        step={0.5}
        format={(value) => value.toFixed(1)}
        onChange={(letterSpacing) => update({ letterSpacing }, `letterSpacing:${layer.id}`)}
      />
      <SliderField
        label={t("inspector.text.lineHeight")}
        value={layer.lineHeight ?? 1}
        min={0.8}
        max={3}
        step={0.05}
        format={(value) => value.toFixed(2)}
        onChange={(lineHeight) => update({ lineHeight }, `lineHeight:${layer.id}`)}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{t("inspector.text.shadow")}</FieldLabel>
          <Switch
            checked={shadow !== undefined}
            onCheckedChange={(checked) =>
              update({ shadow: checked ? { ...DEFAULT_TEXT_SHADOW } : undefined })
            }
            aria-label={t("inspector.text.shadow")}
          />
        </div>
        {shadow !== undefined ? (
          <>
            <ColorField
              label={t("inspector.text.shadowColor")}
              value={shadow.color}
              onChange={(color, key) => update({ shadow: { ...shadow, color } }, key)}
              coalesceKey={`shadowColor:${layer.id}`}
            />
            <SliderField
              label={t("inspector.text.shadowBlur")}
              value={shadow.blur}
              min={0}
              max={40}
              step={1}
              onChange={(blur) => update({ shadow: { ...shadow, blur } }, `shadowBlur:${layer.id}`)}
            />
            <SliderField
              label={t("inspector.text.shadowOffsetX")}
              value={shadow.offsetX}
              min={-20}
              max={20}
              step={1}
              onChange={(offsetX) =>
                update({ shadow: { ...shadow, offsetX } }, `shadowOffsetX:${layer.id}`)
              }
            />
            <SliderField
              label={t("inspector.text.shadowOffsetY")}
              value={shadow.offsetY}
              min={-20}
              max={20}
              step={1}
              onChange={(offsetY) =>
                update({ shadow: { ...shadow, offsetY } }, `shadowOffsetY:${layer.id}`)
              }
            />
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{t("inspector.text.outline")}</FieldLabel>
          <Switch
            checked={layer.stroke !== undefined}
            onCheckedChange={(checked) =>
              update(
                checked
                  ? { stroke: "#FFFFFF", strokeWidth: 2 }
                  : { stroke: undefined, strokeWidth: undefined },
              )
            }
            aria-label={t("inspector.text.outline")}
          />
        </div>
        {layer.stroke !== undefined ? (
          <>
            <ColorField
              label={t("inspector.text.color")}
              value={layer.stroke}
              onChange={(stroke, key) => update({ stroke }, key)}
              coalesceKey={`outlineColor:${layer.id}`}
            />
            <SliderField
              label={t("inspector.text.outlineWidth")}
              value={layer.strokeWidth ?? 2}
              min={0}
              max={10}
              step={0.5}
              format={(value) => value.toFixed(1)}
              onChange={(strokeWidth) => update({ strokeWidth }, `outlineWidth:${layer.id}`)}
            />
          </>
        ) : null}
      </div>
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
  // Lines have no fillable interior: `fill` is the line color and
  // `strokeWidth` is the line thickness, so it's always editable.
  const isLine = layer.shape === "line";

  return (
    <>
      <ColorField
        label={t("inspector.shape.fill")}
        value={layer.fill}
        onChange={(fill, key) => update({ fill }, key)}
        coalesceKey={`fill:${layer.id}`}
      />
      {isLine ? null : (
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
      )}
      {hasStroke || isLine ? (
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
      {isLine ? null : (
        <NumberField
          label={t("inspector.shape.height")}
          value={Math.round(layer.height)}
          min={8}
          max={2400}
          onCommit={(height) => update({ height })}
        />
      )}
      <FlipButtons layer={layer} update={update} />
    </>
  );
}

function ImageInspector({ layer, update }: { layer: ImageLayer; update: UpdateFn }) {
  const { t } = useTranslation("coverEditor");
  // Const local so the filters narrowing survives inside onChange closures.
  const filters = layer.filters ?? {};

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {t("inspector.image.dimensions", {
          width: Math.round(layer.width * layer.scaleX),
          height: Math.round(layer.height * layer.scaleY),
        })}
      </p>
      <SliderField
        label={t("inspector.image.cornerRadius")}
        value={layer.cornerRadius ?? 0}
        min={0}
        max={200}
        step={1}
        onChange={(cornerRadius) => update({ cornerRadius }, `cornerRadius:${layer.id}`)}
      />
      <div className="flex flex-col gap-1">
        <FieldLabel>{t("inspector.image.filters")}</FieldLabel>
        <SliderField
          label={t("inspector.image.brightness")}
          value={filters.brightness ?? 0}
          min={-1}
          max={1}
          step={0.05}
          format={(value) => value.toFixed(2)}
          onChange={(brightness) =>
            update({ filters: { ...filters, brightness } }, `filterBrightness:${layer.id}`)
          }
        />
        <SliderField
          label={t("inspector.image.contrast")}
          value={filters.contrast ?? 0}
          min={-100}
          max={100}
          step={1}
          onChange={(contrast) =>
            update({ filters: { ...filters, contrast } }, `filterContrast:${layer.id}`)
          }
        />
        <SliderField
          label={t("inspector.image.saturate")}
          value={filters.saturate ?? 0}
          min={-100}
          max={100}
          step={1}
          onChange={(saturate) =>
            update({ filters: { ...filters, saturate } }, `filterSaturate:${layer.id}`)
          }
        />
        <SliderField
          label={t("inspector.image.blur")}
          value={filters.blur ?? 0}
          min={0}
          max={40}
          step={1}
          onChange={(blur) => update({ filters: { ...filters, blur } }, `filterBlur:${layer.id}`)}
        />
        <div className="flex gap-1">
          <ToggleButton
            label={t("inspector.image.grayscale")}
            pressed={filters.grayscale ?? false}
            onToggle={() => update({ filters: { ...filters, grayscale: !(filters.grayscale ?? false) } })}
          />
          <ToggleButton
            label={t("inspector.image.sepia")}
            pressed={filters.sepia ?? false}
            onToggle={() => update({ filters: { ...filters, sepia: !(filters.sepia ?? false) } })}
          />
        </div>
      </div>
      <FlipButtons layer={layer} update={update} />
    </>
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
  onAlign,
}: {
  layer: CoverLayer | null;
  onUpdate: (id: string, patch: Partial<CoverLayer>, coalesceKey?: string) => void;
  onMove: (id: string, direction: "forward" | "backward" | "top" | "bottom") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAlign: (align: CanvasAlign) => void;
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

        <PositionSection layer={layer} update={update} />
        <CanvasAlignSection onAlign={onAlign} />

        <Separator />

        {layer.kind === "text" ? <TextInspector layer={layer} update={update} /> : null}
        {layer.kind === "chips" ? <ChipsInspector layer={layer} update={update} /> : null}
        {layer.kind === "shape" ? <ShapeInspector layer={layer} update={update} /> : null}
        {layer.kind === "image" ? <ImageInspector layer={layer} update={update} /> : null}
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
