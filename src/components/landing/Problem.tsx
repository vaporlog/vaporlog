import { useTranslation } from "react-i18next";
import Reveal from "@/components/landing/Reveal";

/**
 * Empathy before selling (viral-product #21): describe the problem better
 * than the user can. One idea on this screen — nothing else (#6).
 */
export default function Problem() {
  const { t } = useTranslation("landing");

  return (
    <section className="border-t border-border/60 py-20 text-center sm:py-28">
      <Reveal>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t("problem.title")}
        </h2>
      </Reveal>
      <Reveal delayMs={80}>
        <p className="mx-auto mt-4 text-xl font-medium text-foreground sm:text-2xl">
          {t("problem.punch")}
        </p>
      </Reveal>
      <Reveal delayMs={160}>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("problem.body")}
        </p>
      </Reveal>
    </section>
  );
}
