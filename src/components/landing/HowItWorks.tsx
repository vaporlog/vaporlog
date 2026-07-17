import { PenLine, Sparkles, Users, type LucideIcon } from "lucide-react";
import Reveal from "@/components/landing/Reveal";
import { getCommunitySessions } from "@/lib/data";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** How it works — three steps, one screen, one idea. */
export default function HowItWorks() {
  const sessionsCount = getCommunitySessions().length;

  const STEPS: Step[] = [
    {
      icon: PenLine,
      title: "Log it",
      body: "Strain, device, temperature, how it felt. Thirty seconds, from the couch, mid-session.",
    },
    {
      icon: Sparkles,
      title: "Discover your patterns",
      body: "Your ratings surface the temps and strains you love most — your favorites, found for you.",
    },
    {
      icon: Users,
      title: "Learn from experts",
      // No public sessions yet at launch: describe the feed, skip the zero.
      body:
        sessionsCount > 0
          ? `${sessionsCount} public sessions from connoisseurs, down to the exact degree. Copy what works.`
          : "A public feed of sessions from connoisseurs, down to the exact degree. Copy what works.",
    },
  ];

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Log. Discover. Learn.
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
                Step {index + 1}
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
