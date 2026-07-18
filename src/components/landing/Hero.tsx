import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import CtaButton from "@/components/landing/CtaButton";
import Reveal from "@/components/landing/Reveal";
import { useDevices, usePublicSessions, useStrains } from "@/lib/data";

/**
 * Hero — sells alone (viral-product #20): a headline a fifth-grader gets
 * (#7) with emotional charge (#18), a subhead of numbers not adjectives
 * (#3), and one CTA (#22) that says what happens next (#28). Counts are
 * live from the catalog — never hardcoded. While public sessions hydrate
 * from the cloud (or when there are none), the count-free variant shows —
 * it never quotes a zero.
 */
export default function Hero() {
  const { t, i18n } = useTranslation("landing");
  const { strains } = useStrains();
  const { sessions, loading: sessionsLoading } = usePublicSessions();
  // Bundled count first (8), grows to the full API catalog on hydrate.
  const { devices } = useDevices();
  const devicesCount = devices.length;
  const sessionsCount = sessions.length;
  const strainLabel =
    strains.length > 0
      ? t("hero.strainsCount", {
          count: strains.length.toLocaleString(i18n.language),
        })
      : t("hero.strainsFallback");
  const devicesLabel = t("hero.devicesCount", { count: devicesCount });
  const sessionsLabel = t("hero.sessionsCount", { count: sessionsCount });

  return (
    <section className="flex flex-col items-center gap-7 pb-20 pt-10 text-center sm:pb-28 sm:pt-16">
      <Reveal>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {t("hero.eyebrow")}
        </p>
      </Reveal>

      <Reveal delayMs={60}>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          {t("hero.title")}
        </h1>
      </Reveal>

      <Reveal delayMs={120}>
        {!sessionsLoading && sessionsCount > 0 ? (
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            <Trans
              t={t}
              i18nKey="hero.subhead"
              values={{ strainLabel, devicesLabel, sessionsLabel }}
              components={{
                strong: <span className="font-medium text-foreground" />,
              }}
            />
          </p>
        ) : (
          // Count-free variant: while public sessions hydrate — and whenever
          // the public feed is empty — name the real catalog and invite the
          // first public session instead of quoting a zero.
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            <Trans
              t={t}
              i18nKey="hero.subheadFirst"
              values={{ strainLabel, devicesLabel }}
              components={{
                strong: <span className="font-medium text-foreground" />,
              }}
            />
          </p>
        )}
      </Reveal>

      <Reveal delayMs={180}>
        <CtaButton />
      </Reveal>

      <Reveal delayMs={240}>
        <Link
          to="/welcome?mode=signin"
          className="pressable text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          {t("hero.login")}
        </Link>
      </Reveal>
    </section>
  );
}
