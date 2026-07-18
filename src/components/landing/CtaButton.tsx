import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The ONE call to action on the page (viral-product #22). The label says
 * what happens next (#28) and the click-trigger line underneath answers
 * "what does it cost / how long does it take" before the brain asks.
 */
export default function CtaButton({ centered = true }: { centered?: boolean }) {
  const { t } = useTranslation("landing");

  return (
    <div
      className={`flex flex-col gap-3 ${centered ? "items-center" : "items-start"}`}
    >
      <Button
        asChild
        size="lg"
        className="pressable herb-hover h-12 bg-herb px-7 text-base font-semibold text-herb-foreground"
      >
        <Link to="/welcome">
          {t("cta.button")}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <p className="text-sm text-muted-foreground">{t("cta.sub")}</p>
    </div>
  );
}
