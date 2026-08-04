import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FeedSessionCard from "@/components/feed/FeedSessionCard";
import ReviewStars from "@/components/profile/ReviewStars";
import {
  displayDeviceName,
  formatMemberSince,
} from "@/components/profile/profile-utils";
import { useStrains } from "@/lib/data";
import { fetchPublicProfile } from "@/lib/profile";
import type { PublicProfile as PublicProfileData } from "@/lib/types";

type PageState =
  | { status: "loading" }
  | { status: "private" }
  | { status: "ready"; profile: PublicProfileData };

/**
 * /u/:handle — the public profile (open route, no auth).
 *
 * Three states: loading; the identical "private or doesn't exist" view for
 * unknown handles and private profiles (the server answers both with the
 * same 404 — never reveal which); and the profile itself: identity header,
 * the owner's individually published sessions (same cards as the feed),
 * and the optional stats / reviews / collection blocks, rendered only
 * when the payload carries them. Grams and hours never appear here — the
 * server keeps them out of the payload entirely.
 */
export default function PublicProfile() {
  const { t } = useTranslation("profile");
  const { handle = "" } = useParams<{ handle: string }>();
  const [state, setState] = useState<PageState>({ status: "loading" });

  // Await the lazy catalog so session cards and device names resolve
  // (humanized-slug fallback until it lands, same as the feed).
  useStrains();

  // Reset to loading when the handle changes — state adjusted during
  // render (React's pattern), not inside the fetch effect.
  const [lastHandle, setLastHandle] = useState(handle);
  if (lastHandle !== handle) {
    setLastHandle(handle);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let alive = true;
    fetchPublicProfile(handle)
      .then((profile) => {
        if (alive) setState({ status: "ready", profile });
      })
      .catch(() => {
        if (alive) setState({ status: "private" });
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  if (state.status === "loading") {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-center"
        role="status"
      >
        <p className="font-medium">{t("public.loading.title")}</p>
      </div>
    );
  }

  if (state.status === "private") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-base font-medium text-foreground">
          {t("public.private.title")}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("public.private.body")}
        </p>
        <Button
          asChild
          variant="outline"
          className="pressable mt-1"
        >
          <Link to="/">{t("public.private.cta")}</Link>
        </Button>
      </div>
    );
  }

  const { profile } = state;
  const sinceLabel = formatMemberSince(profile.memberSince);

  return (
    <div className="space-y-10">
      {/* Identity header */}
      <section aria-label={profile.handle} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-herb/10 text-2xl font-semibold text-herb">
              {profile.handle.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold leading-tight tracking-tight">
              @{profile.handle}
            </h1>
            {sinceLabel !== "" && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("public.memberSince", { date: sinceLabel })}
              </p>
            )}
          </div>
        </div>
        {profile.bio !== "" && (
          <p className="max-w-prose whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
            {profile.bio}
          </p>
        )}
        {profile.favoriteDevice !== undefined && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Star className="size-3.5 fill-herb text-herb" aria-hidden="true" />
            {t("public.favoriteDevice")}:{" "}
            <span className="font-medium text-foreground/80">
              {profile.favoriteDevice.name}
            </span>
          </p>
        )}
      </section>

      {/* Optional stats block — total sessions + favorite device only. */}
      {profile.stats !== undefined && (
        <section aria-labelledby="public-stats-heading" className="space-y-4">
          <h2
            id="public-stats-heading"
            className="text-xl font-semibold tracking-tight"
          >
            {t("public.statsTitle")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("public.totalSessions")}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {profile.stats.totalSessions}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("public.favoriteDevice")}
              </p>
              <p className="mt-1 truncate text-3xl font-semibold tracking-tight text-foreground">
                {profile.stats.favoriteDevice?.name ?? "—"}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Published sessions — the same card the feed uses. */}
      <section aria-labelledby="public-sessions-heading" className="space-y-4">
        <h2
          id="public-sessions-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {t("public.sessionsTitle")}
        </h2>
        {profile.sessions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {profile.sessions.map((session) => (
              <FeedSessionCard key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            {t("public.noSessions")}
          </p>
        )}
      </section>

      {/* Optional reviews block. */}
      {profile.reviews !== undefined && profile.reviews.length > 0 && (
        <section aria-labelledby="public-reviews-heading" className="space-y-4">
          <h2
            id="public-reviews-heading"
            className="text-xl font-semibold tracking-tight"
          >
            {t("public.reviewsTitle")}
          </h2>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {profile.reviews.map((review) => (
              <li key={review.deviceSlug} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {review.deviceName ?? displayDeviceName(review.deviceSlug)}
                  </span>
                  <ReviewStars
                    rating={review.rating}
                    label={t("reviews.dialog.ratingAria", {
                      value: review.rating,
                    })}
                  />
                </div>
                {review.body !== "" && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {review.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Optional collection block — session counts only, never amounts. */}
      {profile.collection !== undefined && profile.collection.length > 0 && (
        <section
          aria-labelledby="public-collection-heading"
          className="space-y-4"
        >
          <h2
            id="public-collection-heading"
            className="text-xl font-semibold tracking-tight"
          >
            {t("public.collectionTitle")}
          </h2>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {profile.collection.map((device) => (
              <li key={device.slug} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {device.name ?? displayDeviceName(device.slug)}
                </span>
                {device.favorite && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-herb/40 font-normal text-herb"
                  >
                    {t("public.favorite")}
                  </Badge>
                )}
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {t("public.sessionCount", { count: device.sessions })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Visitor CTA */}
      <div className="flex justify-center pt-2">
        <Button
          asChild
          className="pressable herb-hover bg-herb text-herb-foreground"
        >
          <Link to="/welcome">{t("public.cta")}</Link>
        </Button>
      </div>
    </div>
  );
}
