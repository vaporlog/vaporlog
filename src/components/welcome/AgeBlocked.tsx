import { useTranslation } from "react-i18next";
import { Leaf } from "lucide-react";
import WelcomeStep from "@/components/welcome/WelcomeStep";

/**
 * Dead end for visitors under 21. Respectful, warm, and final — no fake
 * workarounds (no "enter a different date" shortcut). The only honest
 * escape hatch mentioned is clearing site data, for genuine typos.
 */
export default function AgeBlocked() {
  const { t } = useTranslation("welcome");
  return (
    <WelcomeStep title={t("blocked.title")}>
      <div className="flex items-start gap-3">
        <Leaf aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-herb" />
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          {t("blocked.body")}
        </p>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        {t("blocked.resetHint")}
      </p>
    </WelcomeStep>
  );
}
