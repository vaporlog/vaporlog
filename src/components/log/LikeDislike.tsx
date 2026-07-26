import { useTranslation } from "react-i18next";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface LikeDislikeProps {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}

/**
 * Binary sentiment: did you like the session? Tapping the active choice
 * clears it back to null (optional). Large targets, clear iconography.
 */
export default function LikeDislike({ value, onChange }: LikeDislikeProps) {
  const { t } = useTranslation("log");

  function pick(next: boolean) {
    onChange(value === next ? null : next);
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not supported — fine */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t("liked.label")}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => pick(true)}
          aria-pressed={value === true}
          aria-label={t("liked.yes")}
          className={cn(
            "pressable flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors duration-150",
            value === true
              ? "border-herb bg-herb text-herb-foreground"
              : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <ThumbsUp className="size-5" aria-hidden="true" />
          {t("liked.yes")}
        </button>
        <button
          type="button"
          onClick={() => pick(false)}
          aria-pressed={value === false}
          aria-label={t("liked.no")}
          className={cn(
            "pressable flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors duration-150",
            value === false
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <ThumbsDown className="size-5" aria-hidden="true" />
          {t("liked.no")}
        </button>
      </div>
    </div>
  );
}
