import Reveal from "@/components/landing/Reveal";
import SessionLogCard from "@/components/landing/SessionLogCard";
import { getCommunitySessions } from "@/lib/data";
import type { SessionLog } from "@/lib/types";

/** The OG Kush · 195°C · Mighty+ session — a real entry from the seed data. */
const SHOWCASE_ID = "2026-05-02-og-kush-terphunter";

function findShowcaseSession(): SessionLog | undefined {
  const sessions = getCommunitySessions();
  return (
    sessions.find((s) => s.id === SHOWCASE_ID) ??
    sessions.find((s) => s.rating >= 9) ??
    sessions[0]
  );
}

/**
 * Show the product before explaining it (viral-product #10): one real
 * community session, rendered as product UI — one idea on this screen (#6).
 */
export default function ProductShowcase() {
  const session = findShowcaseSession();
  // Production ships with no community sessions, so there is nothing real
  // to demo — the section quietly bows out rather than faking an entry.
  if (!session) return null;

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal className="mx-auto max-w-xl">
        <p className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">
          This is a vaporlog session
        </p>
        <SessionLogCard session={session} elevated />
        <p className="mt-6 text-center text-base leading-relaxed text-muted-foreground">
          Everything that made it perfect — strain, temperature, flavor, mood —
          saved in 30 seconds. Next time you ask yourself{" "}
          <span className="text-foreground">
            “what was that one at 195°C?”
          </span>
          , you’ll know.
        </p>
      </Reveal>
    </section>
  );
}
