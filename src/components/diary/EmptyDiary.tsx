import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Warm, illustration-free empty state — one honest line and one action. */
export function EmptyDiary() {
  const { t } = useTranslation("diary");
  return (
    <section className="flex flex-col items-center gap-6 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
        {t("empty.title")}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("empty.subtitle")}
      </p>
      <Button
        asChild
        size="lg"
        className="pressable herb-hover bg-herb text-herb-foreground"
      >
        <Link to="/log">{t("empty.cta")}</Link>
      </Button>
    </section>
  );
}
