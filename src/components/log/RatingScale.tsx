import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface RatingScaleProps {
  value: number | null;
  onChange: (rating: number) => void;
  /** When true, wraps the scale in a gentle error nudge after failed save. */
  invalid?: boolean;
}

/**
 * The 1–10 rating. Large tappable numbers; the ONE herb accent in this app
 * is reserved for moments exactly like this — only the chosen value lights
 * up. Tap the same number again to keep it (rating is required to save).
 */
/**
 * Shake / wiggle for a rejected save attempt — fires once per invalid
 * transition, transform-only. The global prefers-reduced-motion rule in
 * index.css collapses it (movement dropped, color cue stays).
 */
const nudgeCss = `
@keyframes vl-nudge {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.vl-nudge {
  animation: vl-nudge 240ms cubic-bezier(0.36, 0.07, 0.19, 0.97) 1;
}
`;

export default function RatingScale({
  value,
  onChange,
  invalid = false,
}: RatingScaleProps) {
  const { t } = useTranslation("log");

  function pick(n: number) {
    onChange(n);
    // Subtle haptic on real devices — guarded, fire-and-forget.
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not supported — fine */
    }
  }

  return (
    <div
      key={invalid ? "invalid" : "valid"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-colors duration-200",
        invalid ? "vl-nudge border-destructive" : "border-border",
      )}
    >
      <style>{nudgeCss}</style>
      <div
        role="radiogroup"
        aria-label={t("rating.groupAria")}
        className="grid grid-cols-5 gap-2 sm:grid-cols-10"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t("rating.outOf", { n })}
              onClick={() => pick(n)}
              className={cn(
                "pressable flex h-12 items-center justify-center rounded-xl border text-lg font-semibold tabular-nums transition-colors duration-150",
                active
                  ? "herb-hover scale-105 border-herb bg-herb text-herb-foreground"
                  : "border-border bg-background text-foreground hover:border-foreground/30",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {invalid && value === null
            ? t("rating.tapPrompt")
            : value === null
              ? t("rating.scaleHint")
              : null}
        </span>
        {value !== null ? (
          <span
            key={value}
            className="animate-in fade-in-0 slide-in-from-bottom-1 font-medium text-foreground duration-200"
          >
            {value}/10 — {t(`rating.descriptors.${value}`)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
