/*
 * Konva node components for every cover layer kind. Each component
 * renders one layer inside the design Group and exposes its outer node
 * via `register` so the page-level Transformer can pin to it.
 *
 * Conventions:
 * - drag commits {x, y} on dragEnd.
 * - Text and chips follow the Figma box convention: horizontal
 *   transform grows the wrap width, scale resets to 1.
 * - Images, charts, shapes, and data-viz keep scaleX/scaleY from the
 *   transformer (shapes bake scale into width/height instead).
 * - All nodes honor layer.opacity (default 1).
 */

import { useEffect, useState } from "react";
import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Rect,
  Text,
} from "react-konva";
import type Konva from "konva";
import { useTranslation } from "react-i18next";

import {
  dataValueOf,
  humanizeTag,
  ratingToFive,
  ratingToLetter,
  temperatureZone,
  DEFAULT_FONT,
  type ChartLayer,
  type ChipsLayer,
  type ImageLayer,
  type ShapeLayer,
  type TextLayer,
} from "./model";

type NodeProps<L> = {
  layer: L;
  register: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<L>) => void;
};

/** Loads one <img> from a data URL; null while pending or on error. */
function useHtmlImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // Reset during render when the src goes away (adjust-during-render,
  // not an effect — avoids a cascading render).
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    if (src === null) setImg(null);
  }
  useEffect(() => {
    if (src === null) return;
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

/** Shared canvas for chip text measurement — Konva measures through the
 *  same API, so pills hug their labels. */
let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, fontSize: number, fontFamily: string): number {
  if (measureCanvas === null) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (ctx === null) return text.length * fontSize * 0.6;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

// ── Text ────────────────────────────────────────────────────────────

export function CoverTextNode({
  layer,
  register,
  onSelect,
  onChange,
  hidden,
  onEdit,
}: NodeProps<TextLayer> & { hidden: boolean; onEdit: () => void }) {
  return (
    <Text
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      text={layer.text}
      fontSize={layer.fontSize}
      fill={layer.fill}
      fontStyle={layer.fontStyle ?? "normal"}
      fontFamily={layer.fontFamily ?? DEFAULT_FONT}
      width={layer.width}
      wrap="word"
      align={layer.align ?? "left"}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity ?? 1}
      draggable
      visible={!hidden}
      listening={!hidden}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragEnd={(event) =>
        onChange({ x: event.target.x(), y: event.target.y() })
      }
      onTransformEnd={(event) => {
        // Fixed-font word-wrapped box: horizontal scaling grows the wrap
        // width; vertical scaling is ignored (height auto-fits).
        const node = event.target;
        const newWidth = Math.max(80, layer.width * node.scaleX());
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: newWidth,
          scaleX: 1,
          scaleY: 1,
        });
      }}
    />
  );
}

// ── Image ───────────────────────────────────────────────────────────

export function CoverImageNode({ layer, register, onSelect, onChange }: NodeProps<ImageLayer>) {
  const img = useHtmlImage(layer.src);
  const common = {
    ref: register as (node: Konva.Node | null) => void,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    opacity: layer.opacity ?? 1,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) =>
      onChange({ x: event.target.x(), y: event.target.y() }),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      onChange({
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
    },
  };
  if (img === null) {
    return <Rect {...common} fill="#222" cornerRadius={8} />;
  }
  return <KonvaImage {...common} image={img} />;
}

// ── Shape ───────────────────────────────────────────────────────────

export function CoverShapeNode({ layer, register, onSelect, onChange }: NodeProps<ShapeLayer>) {
  const common = {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity ?? 1,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) =>
      onChange({ x: event.target.x(), y: event.target.y() }),
  };
  const bakeTransform = (event: Konva.KonvaEventObject<Event>) => {
    // Shapes bake scale into their width/height so stroke width stays
    // uniform no matter how the user resizes.
    const node = event.target;
    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(8, layer.width * node.scaleX()),
      height: Math.max(8, layer.height * node.scaleY()),
      scaleX: 1,
      scaleY: 1,
    });
  };
  const strokeProps = {
    stroke: layer.stroke,
    strokeWidth: layer.stroke !== undefined ? (layer.strokeWidth ?? 2) : undefined,
  };
  if (layer.shape === "ellipse") {
    return (
      <Ellipse
        ref={register as (node: Konva.Node | null) => void}
        {...common}
        radiusX={layer.width / 2}
        radiusY={layer.height / 2}
        fill={layer.fill}
        {...strokeProps}
        onTransformEnd={bakeTransform}
      />
    );
  }
  return (
    <Rect
      ref={register as (node: Konva.Node | null) => void}
      {...common}
      width={layer.width}
      height={layer.height}
      fill={layer.fill}
      cornerRadius={layer.cornerRadius ?? 0}
      {...strokeProps}
      onTransformEnd={bakeTransform}
    />
  );
}

// ── Chips (tag cloud) ───────────────────────────────────────────────

type ChipBox = { tag: string; x: number; y: number; w: number; h: number };

function layoutChips(layer: ChipsLayer): { boxes: ChipBox[]; height: number } {
  const font = DEFAULT_FONT;
  const padX = layer.fontSize * 0.7;
  const h = layer.fontSize * 1.7;
  const gapX = layer.fontSize * 0.45;
  const gapY = layer.fontSize * 0.5;
  const boxes: ChipBox[] = [];
  let row: ChipBox[] = [];
  let rowWidth = 0;
  let y = 0;
  const align = layer.align ?? "left";

  const flushRow = () => {
    if (row.length === 0) return;
    const offset =
      align === "center"
        ? Math.max(0, (layer.width - rowWidth) / 2)
        : align === "right"
          ? Math.max(0, layer.width - rowWidth)
          : 0;
    let x = offset;
    for (const box of row) {
      box.x = x;
      box.y = y;
      x += box.w + gapX;
      boxes.push(box);
    }
    row = [];
    rowWidth = 0;
    y += h + gapY;
  };

  for (const tag of layer.tags) {
    const label = humanizeTag(tag);
    const w = measureTextWidth(label, layer.fontSize, font) + padX * 2;
    if (rowWidth > 0 && rowWidth + gapX + w > layer.width) flushRow();
    row.push({ tag, x: 0, y: 0, w, h });
    rowWidth += (rowWidth > 0 ? gapX : 0) + w;
  }
  flushRow();
  return { boxes, height: y - gapY };
}

export function CoverChipsNode({ layer, register, onSelect, onChange }: NodeProps<ChipsLayer>) {
  const { boxes } = layoutChips(layer);
  const filled = layer.chipStyle === "filled";
  return (
    <Group
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity ?? 1}
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
          width: Math.max(120, layer.width * node.scaleX()),
          scaleX: 1,
          scaleY: 1,
        });
      }}
    >
      {boxes.map((box) => (
        <Group key={box.tag} x={box.x} y={box.y}>
          <Rect
            width={box.w}
            height={box.h}
            cornerRadius={box.h / 2}
            fill={filled ? layer.accent : undefined}
            stroke={filled ? undefined : layer.accent}
            strokeWidth={filled ? 0 : 2}
          />
          <Text
            width={box.w}
            height={box.h}
            text={humanizeTag(box.tag)}
            fontFamily={DEFAULT_FONT}
            fontSize={layer.fontSize}
            fontStyle="bold"
            fill={filled ? layer.textColor : layer.accent}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      ))}
    </Group>
  );
}

// ── Effects chart ───────────────────────────────────────────────────

export function CoverChartNode({ layer, register, onSelect, onChange }: NodeProps<ChartLayer>) {
  const { t } = useTranslation("coverEditor");
  const W = 600;
  const HEADER = 60;
  const ROW = 44;
  const PAD_X = 24;
  const LABEL_W = 160;
  const BAR_X = PAD_X + LABEL_W;
  const BAR_W = W - BAR_X - 80;
  const H = HEADER + Math.max(1, layer.effects.length) * ROW + 16;
  const moodColor = "#74C69D";
  const unwantedColor = "#DC2626";
  const track = "#1F2937";
  const label = "#E5E7EB";

  return (
    <Group
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity ?? 1}
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
        width={W}
        height={H}
        fill={layer.panelColor ?? "#0E2418"}
        cornerRadius={16}
        stroke={moodColor}
        strokeWidth={2}
      />
      <Text
        x={PAD_X}
        y={PAD_X}
        text={layer.title ?? t("canvas.chartTitle")}
        fontSize={22}
        fontStyle="bold"
        fill="#FFFFFF"
        width={W - PAD_X * 2}
        ellipsis
        wrap="none"
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

// ── Data visualizations (rating / temperature / energy) ─────────────

export function DataVizNode({ layer, register, onSelect, onChange }: NodeProps<TextLayer>) {
  const W = layer.width;
  const font = layer.fontFamily ?? DEFAULT_FONT;
  const value = dataValueOf(layer);
  const presentation = layer.presentation ?? "text";

  return (
    <Group
      ref={register as (node: Konva.Node | null) => void}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity ?? 1}
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
      {presentation === "stars" ? (
        <StarsRow rating={value} width={W} font={font} fill={layer.fill} fontSize={layer.fontSize} />
      ) : null}
      {presentation === "dots" ? (
        <DotsRow rating={value} width={W} fill={layer.fill} fontSize={layer.fontSize} />
      ) : null}
      {presentation === "percent" ? (
        <PercentBig rating={value} width={W} font={font} fill={layer.fill} fontSize={layer.fontSize} />
      ) : null}
      {presentation === "letter" ? (
        <LetterBig rating={value} width={W} font={font} fill={layer.fill} fontSize={layer.fontSize} />
      ) : null}
      {presentation === "thermometer" ? (
        <ThermometerRow temp={value} width={W} fontSize={layer.fontSize} font={font} fill={layer.fill} />
      ) : null}
      {presentation === "chip" ? (
        <ChipBadge temp={value} width={W} fontSize={layer.fontSize} font={font} fill={layer.fill} />
      ) : null}
      {presentation === "gauge" ? (
        <EnergyGauge score={value} width={W} fontSize={layer.fontSize} font={font} fill={layer.fill} />
      ) : null}
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
  return (
    <Group>
      {Array.from({ length: 5 }, (_, i) => {
        const isFilled = i + 1 <= Math.floor(filled);
        const isHalf = !isFilled && i + 0.5 <= filled;
        return (
          <Text
            key={i}
            x={i * cell}
            y={0}
            text={isFilled || isHalf ? "★" : "☆"}
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

/** Five dots filled proportional to rating/2. */
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
      text={ratingToLetter(rating)}
      fontFamily={font}
      fontSize={fontSize}
      fontStyle="bold"
      fill={fill}
      width={width}
    />
  );
}

/** Vertical capsule thermometer with zone-colored fill. */
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
      <Rect width={TRACK_W} height={H} fill="#1F2937" cornerRadius={TRACK_W / 2} />
      <Rect
        y={H * (1 - PCT)}
        width={TRACK_W}
        height={H * PCT}
        fill={zoneColor}
        cornerRadius={TRACK_W / 2}
      />
      <Text
        x={textX}
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
      <Rect width={width} height={H} fill={zoneColor} cornerRadius={H / 2} />
      <Text
        x={PAD}
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

/** Energy/calm gauge: a centered track from -5 to +5 with a marker bar
 *  growing from the middle, plus the signed value. Energy (positive)
 *  is herb green, calm (negative) is blue. */
function EnergyGauge({
  score,
  width,
  fontSize,
  font,
  fill,
}: {
  score: number;
  width: number;
  fontSize: number;
  font: string;
  fill: string;
}) {
  const clamped = Math.max(-5, Math.min(5, score));
  const H = fontSize * 1.1;
  const TRACK_H = Math.max(12, H * 0.28);
  const TRACK_W = Math.max(120, width - fontSize * 2.4);
  const center = TRACK_W / 2;
  const pct = Math.abs(clamped) / 5;
  const barW = (TRACK_W / 2) * pct;
  const color = clamped >= 0 ? "#74C69D" : "#60A5FA";
  const signed = clamped > 0 ? `+${clamped}` : `${clamped}`;
  return (
    <Group>
      <Rect y={(H - TRACK_H) / 2} width={TRACK_W} height={TRACK_H} fill="#1F2937" cornerRadius={TRACK_H / 2} />
      <Rect
        x={clamped >= 0 ? center : center - barW}
        y={(H - TRACK_H) / 2}
        width={barW}
        height={TRACK_H}
        fill={color}
        cornerRadius={TRACK_H / 2}
      />
      <Rect
        x={center - 1}
        y={(H - TRACK_H) / 2 - 4}
        width={2}
        height={TRACK_H + 8}
        fill={fill}
        opacity={0.6}
      />
      <Text
        x={TRACK_W + 16}
        width={fontSize * 2}
        height={H}
        text={signed}
        fontFamily={font}
        fontSize={fontSize}
        fontStyle="bold"
        fill={color}
        verticalAlign="middle"
      />
    </Group>
  );
}
