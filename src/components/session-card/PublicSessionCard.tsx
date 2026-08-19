import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Clock, Flame, Scale, Thermometer, ThumbsUp, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import { getStrain } from "@/lib/data";
import type { SessionLog } from "@/lib/types";
import {
  displayDeviceName,
  displayStrainName,
  isCatalogStrain,
} from "./display";
import { tempZone, tempZoneLabel } from "./temperature";
import EffectRadarChart from "@/components/EffectRadarChart";
import EnergyCalmBar from "@/components/EnergyCalmBar";

/*
 * ============================================================================
 * PUBLIC SESSION CARD — the shareable unit of vaporlog (spec decision 8).
 *
 * ⚠️ OG-IMAGE SOURCE: this layout is the visual reference for the future
 * server-side OG-image generator (@vercel/og in production). Keep the
 * hierarchy — strain name, rating, ritual row, mood chips, pseudonym,
 * three colors (white / near-black / herb) — pixel-faithful when you
 * change it, and port any redesign to the OG template in the same commit.
 * ============================================================================
 */

/** Formats "2026-05-02T09:30:00-06:00" → "May 2, 2026"; null when invalid. */
function formatSessionDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(i18n.language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** One cell of the ritual row — icon, small muted label, value. */
function RitualCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-[7.5rem] flex-1 flex-col items-center gap-1.5 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export default function PublicSessionCard({
  session,
}: {
  session: SessionLog;
}) {
  const { t } = useTranslation("sessionCard");
  const strain = getStrain(session.strainSlug);
  const strainName = displayStrainName(session.strainSlug);
  const deviceName = displayDeviceName(session.deviceSlug);
  const catalogStrain = isCatalogStrain(session.strainSlug);
  const dateLabel = formatSessionDate(session.createdAt);
  const zone =
    session.temperatureC !== null ? tempZone(session.temperatureC) : null;

  const notes = session.notes.trim();
  const hasChips =
    session.moods.length > 0 ||
    session.aromas.length > 0 ||
    session.flavors.length > 0;

  return (
    <article
      aria-label={t("card.ariaLabel", {
        strain: strainName,
        author: session.author,
      })}
      className="w-full rounded-2xl border border-border/60 bg-card px-6 py-10 text-center shadow-sm sm:px-12 sm:py-12"
    >
      {/* Overline */}
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {t("card.overline")}
      </p>

      {/* Strain — the headline. Personal strains have no catalog page, so
          they render as plain text instead of a broken /strains/my-* link. */}
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {catalogStrain ? (
          <Link
            to={`/strains/${session.strainSlug}`}
            className="transition-colors duration-150 hover:text-herb"
          >
            {strainName}
          </Link>
        ) : (
          strainName
        )}
      </h1>
      {strain !== undefined && (
        <p className="mt-2 text-sm text-muted-foreground">
          {strain.type} · {strain.thc}% THC
        </p>
      )}

      {/* Pseudonym + date — the handle links to the author's profile only
          when they made it public; otherwise it stays plain text. Same
          static styling either way (this card is the OG-image reference). */}
      <p className="mt-3 text-sm text-muted-foreground">
        {t("card.by")}{" "}
        {session.authorProfilePublic === true ? (
          <Link
            to={`/u/${encodeURIComponent(session.author)}`}
            aria-label={t("card.authorProfileAria", {
              author: session.author,
            })}
            className="font-medium text-foreground transition-colors duration-150 hover:text-herb"
          >
            {session.author}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{session.author}</span>
        )}
        {dateLabel !== null && ` · ${dateLabel}`}
      </p>

      {/* Rating — the one accent highlight */}
      <div
        className="mt-8 flex items-center justify-center gap-2"
        aria-label={t("card.ratingAria", { rating: session.rating })}
      >
        <span className="text-6xl font-semibold tracking-tight text-herb">
          {session.rating}
        </span>
        <span className="text-2xl font-medium text-muted-foreground">/10</span>
        {session.liked === true && (
          <ThumbsUp className="ml-1 size-8 text-herb" aria-label={t("card.liked")} />
        )}
      </div>

      {/* The ritual row — how it was vaporized */}
      <div className="mt-8 flex flex-wrap justify-center rounded-xl border border-border/60 bg-secondary/40">
        <RitualCell
          icon={<Wind className="size-3.5" aria-hidden />}
          label={t("card.ritual.device")}
          value={deviceName}
        />
        {session.temperatureC !== null && zone !== null && (
          <RitualCell
            icon={<Thermometer className="size-3.5" aria-hidden />}
            label={t("card.ritual.temp")}
            value={`${session.temperatureC}°C · ${tempZoneLabel(zone)}`}
          />
        )}
        {session.durationMin !== null && (
          <RitualCell
            icon={<Clock className="size-3.5" aria-hidden />}
            label={t("card.ritual.duration")}
            value={`${session.durationMin} min`}
          />
        )}
        {session.amountG !== null && (
          <RitualCell
            icon={<Scale className="size-3.5" aria-hidden />}
            label={t("card.ritual.amount")}
            value={`${session.amountG} g`}
          />
        )}
      </div>

      {/* Mood badges + aroma/flavor chips */}
      {hasChips && (
        <div className="mt-8 flex flex-col gap-4">
          {session.moods.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("card.mood")}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {session.moods.map((mood) => (
                  <Badge key={mood} variant="secondary">
                    {translateTag(mood, i18n.language)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {(session.aromas.length > 0 || session.flavors.length > 0) && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("card.aromaFlavor")}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {[...session.aromas, ...session.flavors].map((note) => (
                  <Badge key={note} variant="outline">
                    {translateTag(note, i18n.language)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unwanted effects — only when explicitly published */}
      {session.unwantedEffectsPublic && session.unwantedEffects.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {t("card.unwantedEffects")}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {session.unwantedEffects.map((effect) => (
              <Badge
                key={effect}
                variant="outline"
                className="border-destructive/30 text-destructive"
              >
                {translateTag(effect, i18n.language)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Activities — only when explicitly published */}
      {session.activitiesPublic && session.activities.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {t("card.activities")}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {session.activities.map((activity) => (
              <Badge key={activity} variant="outline">
                {translateTag(activity, i18n.language)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Effect intensity radar — moods always public; unwanted-effect
          intensities only arrive on the payload when the author opted in. */}
      {Object.keys(session.effectIntensities).length > 0 && (
        <div className="mt-8">
          <EffectRadarChart
            intensities={session.effectIntensities}
            unwantedEffects={session.unwantedEffects}
            title={t("card.effectIntensity")}
          />
        </div>
      )}

      {/* Energy / calm bipolar bar */}
      {session.energyCalmScore !== null && (
        <div className="mt-8">
          <EnergyCalmBar
            score={session.energyCalmScore}
            title={t("card.energyCalm")}
          />
        </div>
      )}

      {/* Post-detox return — the badge only ships on public payloads when
          the author opted in (detoxDaysPublic); the dedicated review is a
          quote of its own, above the general notes. */}
      {session.detoxDays !== null && session.detoxDays >= 1 && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <Badge
            variant="outline"
            className="border-herb/40 text-herb"
          >
            <Flame className="size-3" aria-hidden="true" />
            {t("card.detoxBadge", { count: session.detoxDays })}
          </Badge>
          {session.detoxReview.trim() !== "" && (
            <blockquote className="mx-auto max-w-md text-balance text-base italic leading-relaxed text-muted-foreground">
              “{session.detoxReview.trim()}”
            </blockquote>
          )}
        </div>
      )}

      {/* The witness's own words */}
      {notes.length > 0 && (
        <blockquote className="mx-auto mt-8 max-w-md text-balance text-base italic leading-relaxed text-muted-foreground">
          “{notes}”
        </blockquote>
      )}
    </article>
  );
}
