import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface DiaryHeaderProps {
  username: string;
}

/** Time-of-day greeting key, calm and personal (apple-design: direct labels). */
function greetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "late";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** Greeting with the profile pseudonym + the primary journal action. */
export function DiaryHeader({ username }: DiaryHeaderProps) {
  const { t } = useTranslation("diary");
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          {t(`header.greeting.${greetingKey()}`)},
        </p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          {username}
        </h1>
      </div>
      <Button
        asChild
        className="pressable herb-hover bg-herb text-herb-foreground"
      >
        <Link to="/log">{t("header.logSession")}</Link>
      </Button>
    </div>
  );
}
