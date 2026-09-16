/*
 * Left panel of the cover editor — everything the user can drop onto
 * the canvas, Canva-style:
 *
 *   Session data  — one button per session characteristic (strain,
 *                   device, temperature, rating, date, duration,
 *                   amount, energy, notes, author, detox days, liked).
 *                   Data-backed fields offer their visual presentations
 *                   in a dropdown. Fields the session doesn't have are
 *                   hidden, never disabled-teased.
 *   Tags          — aromas / flavors / moods / activities as chip
 *                   clouds, plus the effects chart.
 *   Elements      — text presets, shapes, image upload, brand mascot.
 *   Background    — canvas fill swatches.
 */

import { useRef } from "react";
import {
  BarChart3,
  Calendar,
  Cannabis,
  ChevronDown,
  Circle,
  Clock,
  Gauge,
  ImagePlus,
  MessageSquareText,
  Scale,
  Sparkles,
  Square,
  Star,
  Tags,
  Thermometer,
  ThumbsUp,
  Type,
  User,
  Wind,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  displayDeviceName,
  displayStrainName,
} from "@/components/session-card/display";
import type { SessionLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BG_COLOR,
  buildChipsLayer,
  buildEffectsLayer,
  buildEnergyLayer,
  buildRatingLayer,
  buildShapeLayer,
  buildTemperatureLayer,
  buildTextLayer,
  type BackgroundFill,
  type CoverLayer,
  type EffectsPresentation,
  type TextPresentation,
} from "./model";

const RATING_PRESENTATIONS: { id: TextPresentation; key: string }[] = [
  { id: "text", key: "canvas.rating.text" },
  { id: "stars", key: "canvas.rating.stars" },
  { id: "dots", key: "canvas.rating.dots" },
  { id: "percent", key: "canvas.rating.percent" },
  { id: "letter", key: "canvas.rating.letter" },
];

const TEMPERATURE_PRESENTATIONS: { id: TextPresentation; key: string }[] = [
  { id: "text", key: "canvas.temperature.text" },
  { id: "thermometer", key: "canvas.temperature.thermometer" },
  { id: "chip", key: "canvas.temperature.chip" },
];

const EFFECTS_PRESENTATIONS: { id: EffectsPresentation; key: string }[] = [
  { id: "bar", key: "canvas.effects.bar" },
  { id: "list", key: "canvas.effects.list" },
];

const BACKGROUNDS: BackgroundFill[] = ["night", "solid", "herb", "paper", "transparent"];

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function FieldButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-xs font-medium transition-colors hover:border-herb/60 hover:bg-accent"
    >
      <span className="shrink-0 text-herb [&_svg]:size-3.5" aria-hidden>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function FieldDropdown({
  icon,
  label,
  options,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-xs font-medium transition-colors hover:border-herb/60 hover:bg-accent"
        >
          <span className="shrink-0 text-herb [&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
          <span className="flex-1 truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onPick(option.id)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CoverPalette({
  session,
  background,
  onAddLayer,
  onAddImageFile,
  onAddMascot,
  onBackground,
}: {
  session: SessionLog;
  background: BackgroundFill;
  onAddLayer: (layer: CoverLayer) => void;
  onAddImageFile: (file: File) => void;
  onAddMascot: () => void;
  onBackground: (background: BackgroundFill) => void;
}) {
  const { t, i18n } = useTranslation("coverEditor");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const strainName = displayStrainName(session.strainSlug);
  const deviceName = displayDeviceName(session.deviceSlug);

  const addText = (init: Parameters<typeof buildTextLayer>[0]) =>
    onAddLayer(buildTextLayer(init));

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-3">
        {/* ── Session data ── */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("palette.sessionData")}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <FieldButton
              icon={<Cannabis />}
              label={t("fields.strain")}
              onClick={() =>
                addText({
                  text: strainName,
                  fontSize: 96,
                  fill: "#74C69D",
                  fontStyle: "bold",
                })
              }
            />
            <FieldButton
              icon={<Wind />}
              label={t("fields.device")}
              onClick={() => addText({ text: deviceName, fontSize: 44 })}
            />
            <FieldDropdown
              icon={<Star />}
              label={t("fields.rating")}
              options={RATING_PRESENTATIONS.map((p) => ({ id: p.id, label: t(p.key) }))}
              onPick={(id) =>
                onAddLayer(buildRatingLayer(session.rating, id as TextPresentation))
              }
            />
            {session.temperatureC !== null ? (
              <FieldDropdown
                icon={<Thermometer />}
                label={t("fields.temperature")}
                options={TEMPERATURE_PRESENTATIONS.map((p) => ({
                  id: p.id,
                  label: t(p.key),
                }))}
                onPick={(id) =>
                  onAddLayer(
                    buildTemperatureLayer(session.temperatureC, id as TextPresentation),
                  )
                }
              />
            ) : null}
            <FieldButton
              icon={<Calendar />}
              label={t("fields.date")}
              onClick={() =>
                addText({
                  text: new Date(session.createdAt).toLocaleDateString(i18n.language, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }),
                  fontSize: 36,
                  fill: "#9BA3A0",
                })
              }
            />
            {session.durationMin !== null ? (
              <FieldButton
                icon={<Clock />}
                label={t("fields.duration")}
                onClick={() =>
                  addText({
                    text: t("palette.values.duration", { count: session.durationMin }),
                    fontSize: 44,
                  })
                }
              />
            ) : null}
            {session.amountG !== null ? (
              <FieldButton
                icon={<Scale />}
                label={t("fields.amount")}
                onClick={() =>
                  addText({
                    text: t("palette.values.amount", { value: session.amountG }),
                    fontSize: 44,
                  })
                }
              />
            ) : null}
            {session.energyCalmScore !== null ? (
              <FieldDropdown
                icon={<Gauge />}
                label={t("fields.energy")}
                options={[
                  { id: "gauge", label: t("palette.energy.gauge") },
                  { id: "text", label: t("palette.energy.text") },
                ]}
                onPick={(id) =>
                  onAddLayer(
                    buildEnergyLayer(session.energyCalmScore ?? 0, id as "gauge" | "text"),
                  )
                }
              />
            ) : null}
            {session.liked !== null ? (
              <FieldButton
                icon={<ThumbsUp />}
                label={t("fields.liked")}
                onClick={() =>
                  addText({
                    text: session.liked
                      ? t("palette.values.liked")
                      : t("palette.values.disliked"),
                    fontSize: 64,
                  })
                }
              />
            ) : null}
            {session.detoxDays !== null ? (
              <FieldButton
                icon={<Zap />}
                label={t("fields.detoxDays")}
                onClick={() =>
                  addText({
                    text: t("palette.values.detox", { count: session.detoxDays }),
                    fontSize: 36,
                  })
                }
              />
            ) : null}
            {session.notes.trim() !== "" ? (
              <FieldButton
                icon={<MessageSquareText />}
                label={t("fields.notes")}
                onClick={() =>
                  addText({
                    text: session.notes.trim(),
                    fontSize: 28,
                    width: 700,
                    fill: "#E5E7EB",
                  })
                }
              />
            ) : null}
            <FieldButton
              icon={<User />}
              label={t("fields.author")}
              onClick={() =>
                addText({
                  text: `@${session.author}`,
                  fontSize: 32,
                  fill: "#9BA3A0",
                })
              }
            />
          </div>
        </div>

        <Separator />

        {/* ── Tags & effects ── */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("palette.tags")}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { key: "aromas", tags: session.aromas },
                { key: "flavors", tags: session.flavors },
                { key: "moods", tags: session.moods },
                { key: "activities", tags: session.activities },
              ] as const
            )
              .filter((entry) => entry.tags.length > 0)
              .map((entry) => (
                <FieldButton
                  key={entry.key}
                  icon={<Tags />}
                  label={t(`fields.${entry.key}`)}
                  onClick={() => onAddLayer(buildChipsLayer(entry.tags))}
                />
              ))}
            <FieldDropdown
              icon={<BarChart3 />}
              label={t("fields.effectsChart")}
              options={EFFECTS_PRESENTATIONS.map((p) => ({ id: p.id, label: t(p.key) }))}
              onPick={(id) => {
                const layer = buildEffectsLayer(
                  session,
                  id as EffectsPresentation,
                  t("canvas.chartTitle"),
                );
                if (layer === null) {
                  toast.error(t("canvas.chartNoEffects"));
                  return;
                }
                onAddLayer(layer);
              }}
            />
          </div>
        </div>

        <Separator />

        {/* ── Elements ── */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("palette.elements")}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <FieldDropdown
              icon={<Type />}
              label={t("canvas.addText")}
              options={[
                { id: "heading", label: t("palette.text.heading") },
                { id: "subheading", label: t("palette.text.subheading") },
                { id: "body", label: t("palette.text.body") },
              ]}
              onPick={(id) => {
                const presets: Record<
                  string,
                  { fontSize: number; fontStyle: string }
                > = {
                  heading: { fontSize: 72, fontStyle: "bold" },
                  subheading: { fontSize: 44, fontStyle: "bold" },
                  body: { fontSize: 28, fontStyle: "normal" },
                };
                addText({
                  text: t(`palette.text.${id}Content`),
                  ...presets[id],
                });
              }}
            />
            <FieldButton
              icon={<Square />}
              label={t("palette.shapes.rect")}
              onClick={() => onAddLayer(buildShapeLayer("rect"))}
            />
            <FieldButton
              icon={<Circle />}
              label={t("palette.shapes.ellipse")}
              onClick={() => onAddLayer(buildShapeLayer("ellipse"))}
            />
            <FieldButton
              icon={<ImagePlus />}
              label={t("canvas.addImage")}
              onClick={() => fileInputRef.current?.click()}
            />
            <FieldButton
              icon={<Sparkles />}
              label={t("canvas.addMascot")}
              onClick={onAddMascot}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) onAddImageFile(file);
              event.target.value = "";
            }}
          />
        </div>

        <Separator />

        {/* ── Background ── */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("backgrounds.label")}</SectionLabel>
          <div className="flex flex-wrap items-center gap-2 px-1">
            {BACKGROUNDS.map((fill) => (
              <button
                key={fill}
                type="button"
                onClick={() => onBackground(fill)}
                title={t(`backgrounds.${fill}`)}
                aria-label={t(`backgrounds.${fill}`)}
                aria-pressed={background === fill}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform pressable",
                  background === fill
                    ? "border-herb scale-110"
                    : "border-border hover:scale-105",
                )}
                style={{
                  background:
                    BG_COLOR[fill] ??
                    "repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 0 0 / 12px 12px",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
