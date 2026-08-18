import { Slider } from "@/components/ui/slider";
import { useTranslation } from "react-i18next";

interface EnergyCalmSliderProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * Bipolar -5..+5 slider: -5 very calm, 0 neutral, +5 very energized.
 * Renders as a Leafly-style horizontal bar with a draggable thumb.
 */
export default function EnergyCalmSlider({
  value,
  onChange,
}: EnergyCalmSliderProps) {
  const { t } = useTranslation("log");
  const current = value ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("energyCalm.calm")}</span>
        <span className="font-medium text-foreground">
          {current === 0
            ? t("energyCalm.neutral")
            : current > 0
              ? `+${current}`
              : current}
        </span>
        <span>{t("energyCalm.energized")}</span>
      </div>
      <Slider
        value={[current]}
        onValueChange={([next]) => onChange(next)}
        min={-5}
        max={5}
        step={1}
        aria-label={t("energyCalm.sliderAria")}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="pressable self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("energyCalm.skip")}
      </button>
    </div>
  );
}
