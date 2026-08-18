import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useMySessions, usePublicSessions, useStrains } from "@/lib/data";
import { displayStrainName } from "@/components/session-card/display";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import LearnBlock from "@/components/session-card/LearnBlock";
import PublicSessionCard from "@/components/session-card/PublicSessionCard";
import ShareRow from "@/components/session-card/ShareRow";

/*
 * /s/:id — the public session card (spec decision 8, the virality engine).
 *
 * This is what a BEGINNER sees when an expert shares a session. It must
 * teach (learn block), convert (one CTA → /welcome), and spread (share
 * row). One accent, one CTA, under two mobile screens.
 */

/* Entrance stagger (emil-design-eng: ease-out, transform/opacity only,
 * short delays). Reduced motion: global index.css already collapses
 * animations; the media query below removes it entirely for this page. */
const entranceCss = `
@keyframes vl-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.vl-enter {
  opacity: 0;
  animation: vl-fade-up 480ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
@media (prefers-reduced-motion: reduce) {
  .vl-enter { animation: none; opacity: 1; transform: none; }
}
`;

/** Friendly 404 for unknown or private session ids. */
function SessionNotFound() {
  const { t } = useTranslation("sessionCard");
  return (
    <section className="flex flex-col items-center gap-5 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Compass className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("notFound.title")}
      </h1>
      <p className="max-w-md text-muted-foreground">{t("notFound.body")}</p>
      <Button
        asChild
        className="pressable herb-hover mt-2 bg-herb text-herb-foreground"
      >
        <Link to="/strains">
          {t("notFound.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </section>
  );
}

export default function SessionCard() {
  const { t } = useTranslation("sessionCard");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Await the lazy catalog so the card's strain name/type resolve to the
  // real catalog entry (display.ts falls back to a humanized slug in the
  // meantime; this hook re-renders the page once the catalog lands).
  // Must run unconditionally, before the not-found early return.
  useStrains();
  // Cloud-backed public sessions: the not-found card only renders once the
  // cache has hydrated — before that an unknown id is indistinguishable
  // from a session that is still on its way.
  const { sessions: publicSessions, loading: publicLoading } =
    usePublicSessions();
  // Private cards resolve through the owner's own sessions: only someone
  // signed in as the author ever finds a private id here — for everyone
  // else the session stays invisible (same not-found as an unknown id).
  const { sessions: mySessions, loading: myLoading } = useMySessions();
  const session =
    id !== undefined
      ? (publicSessions.find((s) => s.id === id) ??
        mySessions.find((s) => s.id === id))
      : undefined;

  if (publicLoading || myLoading) {
    return (
      <section
        className="flex flex-col items-center gap-4 py-16 text-center"
        role="status"
      >
        <h1 className="text-2xl font-semibold">{t("loading.title")}</h1>
        <p className="max-w-md text-muted-foreground">{t("loading.body")}</p>
      </section>
    );
  }

  if (session === undefined) {
    return <SessionNotFound />;
  }

  // Found via the owner's own list → private card, visible only to them.
  const isPrivateView = !session.isPublic;
  // Owner check for destructive actions: the session resolves through the
  // signed-in user's own list (private or public). Everyone else — and
  // signed-out visitors — never sees the delete affordance; the API
  // enforces the same ownership rule server-side.
  const isOwner = mySessions.some((s) => s.id === session.id);
  const strainName = displayStrainName(session.strainSlug);

  return (
    <section className="flex flex-col items-center gap-10 pb-6 pt-2 sm:gap-12">
      <style>{entranceCss}</style>

      {/* 1 · THE CARD — hero, centered, generous whitespace */}
      <div className="vl-enter w-full max-w-xl" style={{ animationDelay: "0ms" }}>
        <PublicSessionCard session={session} />
      </div>

      {/* Private view (owner only): a quiet note instead of the viral
          machinery — the link is useless to anyone else by design. */}
      {isPrivateView ? (
        <p
          className="vl-enter text-sm text-muted-foreground"
          style={{ animationDelay: "70ms" }}
        >
          {t("privateNote")}
        </p>
      ) : null}

      {/* Owner only: delete the session (with confirmation), then head
          back to the diary. */}
      {isOwner ? (
        <div className="vl-enter" style={{ animationDelay: "70ms" }}>
          <DeleteSessionButton
            sessionId={session.id}
            strainName={strainName}
            onDeleted={() => navigate("/diary")}
          />
        </div>
      ) : null}

      {/* 2 · LEARN BLOCK — what this temperature means, for beginners */}
      {session.temperatureC !== null && (
        <div className="vl-enter w-full" style={{ animationDelay: "70ms" }}>
          <LearnBlock temperatureC={session.temperatureC} />
        </div>
      )}

      {!isPrivateView && (
        <>
          {/* 3 · ONE CTA — says exactly what happens next */}
          <div
            className="vl-enter flex flex-col items-center gap-3 text-center"
            style={{ animationDelay: "140ms" }}
          >
            <Button
              asChild
              size="lg"
              className="pressable herb-hover bg-herb px-8 text-base text-herb-foreground"
            >
              <Link to="/welcome">
                {t("cta.button")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">{t("cta.subtext")}</p>
          </div>
        </>
      )}

      {/* Share row — copy link, download image, X, Reddit. The owner gets it
          even on private sessions (download works with their token); public
          sessions get it for everyone. */}
      <div className="vl-enter" style={{ animationDelay: "210ms" }}>
        <ShareRow session={session} strainName={strainName} />
      </div>

      {/* 5 · Legal line (spec decision 5) */}
      <p
        className="vl-enter max-w-md text-center text-xs leading-relaxed text-muted-foreground"
        style={{ animationDelay: "280ms" }}
      >
        {t("legal")}
      </p>

      {/* 6 · End strong — the line worth remembering */}
      <p
        className="vl-enter text-center text-lg font-medium tracking-tight text-foreground"
        style={{ animationDelay: "350ms" }}
      >
        {t("tagline")}
      </p>

      {/* Toaster lives in THIS page (cross-slice contract b). */}
      <Toaster position="bottom-center" />
    </section>
  );
}
