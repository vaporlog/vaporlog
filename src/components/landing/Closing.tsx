import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CtaButton from "@/components/landing/CtaButton";
import Reveal from "@/components/landing/Reveal";
import { useStrains } from "@/lib/data";

/**
 * Finish strong (viral-product #4): the last thing 97% of visitors see is
 * a line worth quoting, the CTA repeated, and an honest "free during early
 * access" — never "free forever".
 */
export default function Closing() {
  const { t, i18n } = useTranslation("landing");
  const { strains } = useStrains();
  const catalogLabel =
    strains.length > 0
      ? t("closing.catalogWithCount", {
          count: strains.length.toLocaleString(i18n.language),
        })
      : t("closing.catalog");

  return (
    <section className="border-t border-border/60 py-24 text-center sm:py-32">
      <Reveal>
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t("closing.title")}
        </h2>
      </Reveal>
      <Reveal delayMs={80}>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          {t("closing.subhead")}
        </p>
      </Reveal>
      <Reveal delayMs={160} className="mt-9">
        <CtaButton />
      </Reveal>
      <Reveal delayMs={220}>
        <p className="mt-8 text-sm text-muted-foreground">
          {t("closing.notReady")}{" "}
          <Link
            to="/strains"
            className="pressable font-medium text-foreground underline underline-offset-4 transition-colors duration-150 hover:text-herb"
          >
            {t("closing.browse", { catalog: catalogLabel })}
          </Link>
        </p>
      </Reveal>
    </section>
  );
}
