import { Link } from "react-router-dom";
import CtaButton from "@/components/landing/CtaButton";
import Reveal from "@/components/landing/Reveal";
import { getDevices, usePublicSessions, useStrains } from "@/lib/data";

/**
 * Hero — sells alone (viral-product #20): a headline a fifth-grader gets
 * (#7) with emotional charge (#18), a subhead of numbers not adjectives
 * (#3), and one CTA (#22) that says what happens next (#28). Counts are
 * live from the catalog — never hardcoded. While public sessions hydrate
 * from the cloud (or when there are none), the count-free variant shows —
 * it never quotes a zero.
 */
export default function Hero() {
  const { strains } = useStrains();
  const { sessions, loading: sessionsLoading } = usePublicSessions();
  const devicesCount = getDevices().length;
  const sessionsCount = sessions.length;
  const strainLabel =
    strains.length > 0
      ? `${strains.length.toLocaleString("en-US")} strains`
      : "thousands of strains";

  return (
    <section className="flex flex-col items-center gap-7 pb-20 pt-10 text-center sm:pb-28 sm:pt-16">
      <Reveal>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          The journal of the art of vaporizing
        </p>
      </Reveal>

      <Reveal delayMs={60}>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Remember every session.
        </h1>
      </Reveal>

      <Reveal delayMs={120}>
        {!sessionsLoading && sessionsCount > 0 ? (
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Log the strain, the temperature, the taste, and how it felt — and
            never lose a perfect session again. Start with{" "}
            <span className="font-medium text-foreground">{strainLabel}</span>,{" "}
            <span className="font-medium text-foreground">
              {devicesCount} vaporizers
            </span>
            , and{" "}
            <span className="font-medium text-foreground">
              {sessionsCount} expert sessions
            </span>{" "}
            to learn from.
          </p>
        ) : (
          // Count-free variant: while public sessions hydrate — and whenever
          // the public feed is empty — name the real catalog and invite the
          // first public session instead of quoting a zero.
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Log the strain, the temperature, the taste, and how it felt — and
            never lose a perfect session again. Start with{" "}
            <span className="font-medium text-foreground">{strainLabel}</span>{" "}
            and{" "}
            <span className="font-medium text-foreground">
              {devicesCount} vaporizers
            </span>{" "}
            — then be the first to log a public session others can learn
            from.
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
          Already have an account? Log in
        </Link>
      </Reveal>
    </section>
  );
}
