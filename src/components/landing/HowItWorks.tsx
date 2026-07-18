import { PenLine, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import Reveal from "@/components/landing/Reveal";
import { usePublicSessions } from "@/lib/data";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** How it works — three steps, one screen, one idea. */
export default function HowItWorks() {
  const { t } = useTranslation("landing");
  const { sessions, loading } = usePublicSessions();
  const sessionsCount = sessions.length;

  const STEPS: Step[] = [
    {
      icon: PenLine,
      title: t("howItWorks.steps.log.title"),
      body: t("howItWorks.steps.log.body"),
    },
    {
      icon: Sparkles,
      title: t("howItWorks.steps.discover.title"),
      body: t("howItWorks.steps.discover.body"),
    },
    {
      icon: Users,
      title: t("howItWorks.steps.experts.title"),
      // Count-free until the public feed hydrates — and whenever it is
      // empty: describe the feed, skip the zero.
      body:
        !loading && sessionsCount > 0
          ? t("howItWorks.steps.experts.bodyWithCount", {
              count: sessionsCount,
            })
          : t("howItWorks.steps.experts.bodyNoCount"),
    },
  ];

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("howItWorks.title")}
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} delayMs={index * 90}>
            <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-secondary">
                <step.icon aria-hidden="true" className="size-5 text-foreground" />
              </span>
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                {t("howItWorks.stepLabel", { number: index + 1 })}
              </p>
              <h3 className="text-xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
