import { useTranslation } from "react-i18next";

interface EnergyCalmBarProps {
  /** Bipolar score: -5 very calm, 0 neutral, +5 very energized. */
  score: number | null;
  /** Optional title shown above the bar. */
  title?: string;
}

/**
 * Bipolar bar showing where the session landed between calm and energized.
 * Neutral track, herb marker, card surface — stays on the site's palette.
 */
export default function EnergyCalmBar({ score, title }: EnergyCalmBarProps) {
  const { t } = useTranslation("sessionCard");
  if (score === null) return null;

  // Map -5..5 → 0..100% for the marker position.
  const pct = ((score + 5) / 10) * 100;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4">
      {title ? (
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      ) : null}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full bg-herb shadow"
          style={{ left: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{t("energyCalm.calm")}</span>
        <span className="font-medium text-foreground">
          {score === 0 ? t("energyCalm.neutral") : score > 0 ? `+${score}` : score}
        </span>
        <span>{t("energyCalm.energized")}</span>
      </div>
    </div>
  );
}
