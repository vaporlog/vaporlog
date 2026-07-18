import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Step progress dots for the /welcome flow. Color + transform only
 * (the active dot stretches via scale-x — no layout-animating width).
 */
export default function StepDots({
  step,
  total = 3,
}: {
  /** Current step, 1-based. */
  step: number;
  total?: number;
}) {
  const { t } = useTranslation("welcome");
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={t("steps.progress", { step, total })}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <span
            key={n}
            aria-hidden="true"
            className={cn(
              "h-1.5 w-6 origin-left rounded-full transition-[transform,background-color] duration-200 ease-out-strong",
              n === step && "scale-x-125 bg-herb",
              n < step && "bg-herb/40",
              n > step && "bg-foreground/15",
            )}
          />
        );
      })}
    </div>
  );
}
