import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

interface EffectIntensityListProps {
  /** Selected effect tags (moods + unwanted effects). */
  effects: string[];
  /** Tags that are unwanted effects (rendered in red). */
  unwantedEffects?: string[];
  /** Current intensity map. */
  intensities: Record<string, number>;
  /** Update one effect's intensity. */
  onIntensityChange: (effect: string, intensity: number) => void;
}

/**
 * For each selected effect, a 1-10 slider. Lets the user say how strongly
 * each mood or unwanted effect hit them. Values feed the radar chart.
 * Unwanted-effect labels render in destructive red.
 */
export default function EffectIntensityList({
  effects,
  unwantedEffects = [],
  intensities,
  onIntensityChange,
}: EffectIntensityListProps) {
  const { t } = useTranslation("log");
  const unwanted = new Set(unwantedEffects);

  if (effects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("effectIntensity.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {effects.map((effect) => {
        const value = intensities[effect] ?? 5;
        const isUnwanted = unwanted.has(effect);
        return (
          <div key={effect} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label
                className={
                  isUnwanted
                    ? "text-sm font-medium text-destructive"
                    : "text-sm font-medium"
                }
              >
                {effect}
              </Label>
              <span
                className={
                  isUnwanted
                    ? "text-sm font-semibold tabular-nums text-destructive"
                    : "text-sm font-semibold tabular-nums text-herb"
                }
              >
                {value}/10
              </span>
            </div>
            <Slider
              value={[value]}
              onValueChange={([next]) => onIntensityChange(effect, next)}
              min={1}
              max={10}
              step={1}
              aria-label={t("effectIntensity.sliderAria", { effect })}
              className={
                isUnwanted
                  ? "[&_[data-slot=slider-range]]:bg-destructive [&_[data-slot=slider-thumb]]:border-destructive"
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
