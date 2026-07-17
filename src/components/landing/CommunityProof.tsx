import { Link } from "react-router-dom";
import Reveal from "@/components/landing/Reveal";
import SessionLogCard from "@/components/landing/SessionLogCard";
import { getCommunitySessions } from "@/lib/data";
import type { SessionLog } from "@/lib/types";

/** Real community proof: three distinct connoisseurs, devices and temps. */
const PROOF_IDS = [
  "2026-05-02-green-crack-mountainvaper", // 10 · DynaVap WoodWynd · 175°C
  "2026-05-02-granddaddy-purple-insomniac", // 10 · Volcano Hybrid · 205°C
  "2026-05-02-blue-dream-vaporenthusiast", // 9  · Venty · 175°C
];

function pickProofSessions(): SessionLog[] {
  const all = getCommunitySessions();
  const picked = PROOF_IDS.map((id) => all.find((s) => s.id === id)).filter(
    (s): s is SessionLog => s !== undefined,
  );
  if (picked.length > 0) return picked;
  return [...all].sort((a, b) => b.rating - a.rating).slice(0, 3);
}

/**
 * Social proof (viral-product #29): real public sessions from real
 * pseudonyms, numbers in the headline (#3). Each card opens the actual
 * public session page — proof you can click, not praise we wrote.
 */
export default function CommunityProof() {
  const all = getCommunitySessions();
  const sessions = pickProofSessions();

  // Production launches with an empty public feed: invite the first
  // members instead of quoting counts that would all read zero.
  if (sessions.length === 0) {
    return (
      <section className="border-t border-border/60 py-20 sm:py-28">
        <Reveal>
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            Be the first to share a session.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-base leading-relaxed text-muted-foreground">
            The public feed opens with its first members. Log a session, make
            it public, and it can appear here — pseudonym always, private by
            default.
          </p>
        </Reveal>
      </section>
    );
  }

  const nineOrHigher = all.filter((s) => s.rating >= 9).length;

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {all.length} expert sessions. {nineOrHigher} rated 9 or higher.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-base leading-relaxed text-muted-foreground">
          Connoisseurs documenting the craft — pseudonyms always, private by
          default. Tap a session to see exactly how they vaporize.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {sessions.map((session, index) => (
          <Reveal key={session.id} delayMs={index * 90}>
            <Link
              to={`/s/${session.id}`}
              className="pressable vl-card-hover block rounded-xl"
            >
              <SessionLogCard session={session} />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
