import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { useMySessions, usePublicSessions, useStrains } from "@/lib/data";
import {
  getCommunityTopStrains,
  getLovedSessions,
  getRecommendations,
} from "@/lib/recommend";

const RECOMMENDATION_COUNT = 6;
const COMMUNITY_FALLBACK_COUNT = 4;

/**
 * Explainable recommendations (spec decision 7): content-based matches from
 * the user's 8+ rated sessions, each with its "because you loved …" reason.
 * Cold start: community-loved strains until the user logs sessions they love.
 * With zero community sessions (production at launch) the cold-start page is
 * just the "log a session" prompt — the community section hides entirely.
 *
 * Scoring runs against the FULL lazy catalog plus cloud-backed sessions, so
 * the page waits for `useStrains()`, `useMySessions()` and
 * `usePublicSessions()` before computing anything — otherwise a
 * not-yet-hydrated cache would masquerade as the cold-start state.
 */
export default function Recommendations() {
  const { t } = useTranslation("recommendations");
  const { sessions: mySessions, loading: myLoading } = useMySessions();
  const { sessions: communitySessions, loading: communityLoading } =
    usePublicSessions();
  const { strains: catalog, loading: catalogLoading } = useStrains();
  const loading = catalogLoading || myLoading || communityLoading;

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
          <h1 className="text-3xl font-semibold">{t("header.title")}</h1>
          <p className="text-muted-foreground">{t("header.tagline")}</p>
        </header>
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
          role="status"
        >
          <p className="font-medium">{t("loading.title")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("loading.subtitle")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("header.title")}</h1>
        <p className="text-muted-foreground">
          {isColdStart
            ? hasCommunityPicks
              ? t("header.subtitleCommunity")
              : t("header.subtitleCold")
            : t("header.learned", { count: lovedCount })}
        </p>
      </header>

      {isColdStart ? (
        <>
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles className="text-herb" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("empty.title")}</EmptyTitle>
              <EmptyDescription>{t("empty.description")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                asChild
                className="pressable herb-hover bg-herb text-herb-foreground"
              >
                <Link to="/log">{t("empty.logCta")}</Link>
              </Button>
            </EmptyContent>
          </Empty>

          {hasCommunityPicks && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">
                {t("community.title")}
              </h2>
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
