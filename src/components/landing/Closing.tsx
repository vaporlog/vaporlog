import { Link } from "react-router-dom";
import CtaButton from "@/components/landing/CtaButton";
import Reveal from "@/components/landing/Reveal";
import { useStrains } from "@/lib/data";

/**
 * Finish strong (viral-product #4): the last thing 97% of visitors see is
 * a line worth quoting, the CTA repeated, and an honest "free during early
 * access" — never "free forever".
 */
export default function Closing() {
  const { strains } = useStrains();
  const catalogLabel =
    strains.length > 0
      ? `${strains.length.toLocaleString("en-US")}-strain catalog`
      : "strain catalog";

  return (
    <section className="border-t border-border/60 py-24 text-center sm:py-32">
      <Reveal>
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Memory fades. Your journal doesn’t.
        </h2>
      </Reveal>
      <Reveal delayMs={80}>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          The best session of your life deserves better than “I think it was
          the green one?”
        </p>
      </Reveal>
      <Reveal delayMs={160} className="mt-9">
        <CtaButton />
      </Reveal>
      <Reveal delayMs={220}>
        <p className="mt-8 text-sm text-muted-foreground">
          Not ready?{" "}
          <Link
            to="/strains"
            className="pressable font-medium text-foreground underline underline-offset-4 transition-colors duration-150 hover:text-herb"
          >
            Browse the {catalogLabel} first
          </Link>
        </p>
      </Reveal>
    </section>
  );
}
