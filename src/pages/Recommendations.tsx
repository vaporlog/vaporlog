import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import StrainCard from "@/components/strains/StrainCard";
import { communityAverageMap } from "@/components/strains/strain-utils";
import { getCommunitySessions, getMySessions, useStrains } from "@/lib/data";
import {
  getCommunityTopStrains,
  getLovedSessions,
  getRecommendations,
} from "@/lib/recommend";
import type { SessionLog } from "@/lib/types";

const RECOMMENDATION_COUNT = 6;
const COMMUNITY_FALLBACK_COUNT = 4;

/**
 * Explainable recommendations (spec decision 7): content-based matches from
 * the user's 8+ rated sessions, each with its "because you loved …" reason.
 * Cold start: community-loved strains until the user logs sessions they love.
 * With zero community sessions (production at launch) the cold-start page is
 * just the "log a session" prompt — the community section hides entirely.
 *
 * Scoring runs against the FULL lazy catalog, so the page waits for
 * `useStrains()` before computing anything — otherwise an empty catalog
 * would masquerade as the cold-start state.
 */
export default function Recommendations() {
  // Read once — this page does not edit sessions, so a stable snapshot is fine.
  const [mySessions] = useState<SessionLog[]>(() => getMySessions());

  const { strains: catalog, loading } = useStrains();
  const communitySessions = useMemo(() => getCommunitySessions(), []);
  const averages = useMemo(
    () => communityAverageMap(communitySessions),
    [communitySessions],
  );

  const recommendations = useMemo(
    () => getRecommendations(mySessions, catalog, RECOMMENDATION_COUNT),
    [mySessions, catalog],
  );
  const lovedCount = useMemo(() => getLovedSessions(mySessions).length, [mySessions]);
  const communityPicks = useMemo(
    () => getCommunityTopStrains(catalog, communitySessions, COMMUNITY_FALLBACK_COUNT),
    [catalog, communitySessions],
  );

  const isColdStart = recommendations.length === 0;
  const hasCommunityPicks = communityPicks.length > 0;

  if (loading) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Recommendations</h1>
          <p className="text-muted-foreground">What to try next.</p>
        </header>
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
          role="status"
        >
          <p className="font-medium">Loading the catalog…</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your palate gets matched against the full strain catalog as soon
            as it arrives.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Recommendations</h1>
        <p className="text-muted-foreground">
          {isColdStart
            ? hasCommunityPicks
              ? "What to try next — starting with what the community loves."
              : "What to try next — learned from the sessions you love."
            : `Learned from ${lovedCount} ${
                lovedCount === 1 ? "session" : "sessions"
              } you rated 8 or higher.`}
        </p>
      </header>

      {isColdStart ? (
        <>
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles className="text-herb" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Your palate, learned</EmptyTitle>
              <EmptyDescription>
                Log a few sessions you love and vaporlog learns your palate —
                terpenes, effects, and flavors — to suggest what to try next.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                asChild
                className="pressable herb-hover bg-herb text-herb-foreground"
              >
                <Link to="/log">Log a session</Link>
              </Button>
            </EmptyContent>
          </Empty>

          {hasCommunityPicks && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Loved by the community</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {communityPicks.map((pick) => (
                  <StrainCard
                    key={pick.strain.slug}
                    strain={pick.strain}
                    community={{
                      avg: pick.avgRating,
                      count: pick.sessionCount,
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recommendations.map((rec) => (
            <StrainCard
              key={rec.strain.slug}
              strain={rec.strain}
              community={averages.get(rec.strain.slug) ?? null}
              reason={rec.reason}
            />
          ))}
        </div>
      )}
    </section>
  );
}
