import Reveal from "@/components/landing/Reveal";

/**
 * Empathy before selling (viral-product #21): describe the problem better
 * than the user can. One idea on this screen — nothing else (#6).
 */
export default function Problem() {
  return (
    <section className="border-t border-border/60 py-20 text-center sm:py-28">
      <Reveal>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Your best session ever — which temp was it?
        </h2>
      </Reveal>
      <Reveal delayMs={80}>
        <p className="mx-auto mt-4 text-xl font-medium text-foreground sm:text-2xl">
          Which strain? Which vaporizer? Gone.
        </p>
      </Reveal>
      <Reveal delayMs={160}>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Memory keeps the feeling and loses the details — and the details were
          the recipe. Notes apps bury them. Spreadsheets never get opened from
          the couch. vaporlog keeps every degree, every flavor, every rating,
          exactly where you’ll look next time.
        </p>
      </Reveal>
    </section>
  );
}
