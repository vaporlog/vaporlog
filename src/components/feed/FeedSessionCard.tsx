import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star, ThumbsUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStrain } from "@/lib/data";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import type { SessionLog } from "@/lib/types";
import {
  displayDeviceName,
  displayStrainName,
  formatFeedDate,
  formatRating,
  tempZone,
  tempZoneLabel,
} from "./feed-utils";

interface FeedSessionCardProps {
  session: SessionLog;
}

/**
 * One public session in the community feed — a compact preview that links
 * to the full shareable card at /s/:id. The whole surface is the link, so
 * nested tappables stay exceptional: catalog strains get a type badge
 * instead of a second link, and personal (my-*) strains render their
 * humanized name. The ONE exception is the author handle — it links to
 * /u/:handle when (and only when) the author's profile is public
 * (`authorProfilePublic === true`, a public-feed-only field); its click
 * stops propagation so the card link does not fire too.
 *
 * Herb is spent exactly once here: the rating. Everything else stays on
 * the neutral scale. No entrance animation — this is a high-frequency
 * surface and the press/hover feedback primitives carry the feel.
 */
export default function FeedSessionCard({ session }: FeedSessionCardProps) {
  const { t } = useTranslation("feed");
  const strain = getStrain(session.strainSlug);
  const strainName = displayStrainName(session.strainSlug);
  const deviceName = displayDeviceName(session.deviceSlug);
  const zone =
    session.temperatureC !== null ? tempZone(session.temperatureC) : null;
  const dateLabel = formatFeedDate(session.createdAt);

  return (
    <Link
      to={`/s/${encodeURIComponent(session.id)}`}
      aria-label={t("card.ariaLabel", {
        strain: strainName,
        author: session.author,
        rating: formatRating(session.rating),
      })}
      className="pressable vl-card-hover block rounded-xl border border-border/60 bg-card p-4 sm:p-5"
    >
      {/* Strain + author · rating */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {strainName}
            </h2>
            {strain !== undefined && (
              <Badge
                variant="outline"
                className="font-normal text-muted-foreground"
              >
                {strain.type}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("card.by")}{" "}
            {session.authorProfilePublic === true ? (
              // The author made their profile public: the handle becomes a
              // nested link to it. stopPropagation keeps the surrounding
              // card link (/s/:id) from also firing on this click.
              <Link
                to={`/u/${encodeURIComponent(session.author)}`}
                aria-label={t("card.authorProfileAria", {
                  author: session.author,
                })}
                onClick={(event) => event.stopPropagation()}
                className="font-medium text-foreground/80 transition-colors duration-150 hover:text-herb"
              >
                @{session.author}
              </Link>
            ) : (
              <span className="font-medium text-foreground/80">
                @{session.author}
              </span>
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm">
          <Star className="size-3.5 fill-herb text-herb" aria-hidden="true" />
          <span className="font-semibold tabular-nums text-herb">
            {formatRating(session.rating)}
          </span>
          <span className="text-muted-foreground">/10</span>
          {session.liked === true && (
            <ThumbsUp
              className="ml-1 size-3.5 text-herb"
              aria-label={t("card.liked")}
            />
          )}
        </span>
      </div>

      {/* Device · temperature with zone · date */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{deviceName}</span>
        {session.temperatureC !== null && zone !== null && (
          <span className="tabular-nums">
            {session.temperatureC}°C · {tempZoneLabel(zone)}
          </span>
        )}
        {dateLabel !== "" && <span className="text-xs">{dateLabel}</span>}
      </div>

      {/* Post-detox badge — only present on the payload when the author
          opted in; kept quiet (herb is spent on the rating). */}
      {session.detoxDays !== null && session.detoxDays >= 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="font-normal text-muted-foreground"
          >
            <Flame className="size-3 text-herb" aria-hidden="true" />
            {t("card.detoxBadge", { count: session.detoxDays })}
          </Badge>
        </div>
      )}

      {/* Moods */}
      {session.moods.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {session.moods.map((mood) => (
            <Badge
              key={mood}
              variant="secondary"
              className="font-normal text-muted-foreground"
            >
              {translateTag(mood, i18n.language)}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}
