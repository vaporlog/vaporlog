import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ThumbsDown, ThumbsUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import EffectRadarChart from "@/components/EffectRadarChart";
import EnergyCalmBar from "@/components/EnergyCalmBar";
import type { SessionLog } from "@/lib/types";
import {
  displayDeviceName,
  displayStrainName,
  formatSessionDate,
  isCatalogStrain,
  sessionDetailParts,
} from "./diary-utils";

interface DiarySessionCardProps {
  session: SessionLog;
  onTogglePublic: (id: string) => void;
  onToggleInFeed: (id: string) => void;
  onToggleUnwantedEffectsPublic: (id: string) => void;
  onToggleActivitiesPublic: (id: string) => void;
  /** True while this card's publish/unpublish request is in flight. */
  pending?: boolean;
}

/**
 * One personal journal entry: strain/device/parameters, moods, rating,
 * notes excerpt, plus the explicit publish switch and related actions.
 */
export function DiarySessionCard({
  session,
  onTogglePublic,
  onToggleInFeed,
  onToggleUnwantedEffectsPublic,
  onToggleActivitiesPublic,
  pending = false,
}: DiarySessionCardProps) {
  const { t } = useTranslation("diary");
  const strainName = displayStrainName(session.strainSlug);
  const deviceName = displayDeviceName(session.deviceSlug);
  const details = sessionDetailParts(session);
  const logAgainTo = `/log?strain=${encodeURIComponent(
    session.strainSlug,
  )}&device=${encodeURIComponent(session.deviceSlug)}`;

  return (
    <Card className="shadow-xs">
      <CardContent className="space-y-3 p-4 sm:p-5">
        {/* Strain + rating */}
        <div className="flex items-baseline justify-between gap-3">
          {isCatalogStrain(session.strainSlug) ? (
            <Link
              to={`/strains/${encodeURIComponent(session.strainSlug)}`}
              className="pressable text-base font-semibold text-foreground underline-offset-4 transition-colors duration-150 hover:text-herb hover:underline"
            >
              {strainName}
            </Link>
          ) : (
            <span className="text-base font-semibold text-foreground">
              {strainName}
            </span>
          )}
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-semibold tabular-nums text-herb">
              {session.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">/10</span>
            </span>
            {session.liked !== null && (
              <span
                aria-label={
                  session.liked ? t("card.liked.yes") : t("card.liked.no")
                }
                className="text-muted-foreground"
              >
                {session.liked ? (
                  <ThumbsUp className="size-4 text-herb" aria-hidden />
                ) : (
                  <ThumbsDown className="size-4 text-destructive" aria-hidden />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Device, parameters, date */}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {deviceName}
            {details.length > 0 && <span> · {details.join(" · ")}</span>}
          </p>
          <p className="text-xs">{formatSessionDate(session.createdAt)}</p>
        </div>

        {/* Post-detox badge — private, always visible to the owner */}
        {session.detoxDays !== null && session.detoxDays >= 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className="border-herb/40 font-normal text-herb"
            >
              <Flame className="size-3" aria-hidden />
              {t("card.detoxBadge", { count: session.detoxDays })}
            </Badge>
          </div>
        )}

        {/* Moods */}
        {session.moods.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.moods.map((mood) => (
              <Badge key={mood} variant="secondary" className="font-normal">
                {translateTag(mood, i18n.language)}
              </Badge>
            ))}
          </div>
        )}

        {/* Unwanted effects — private only */}
        {session.unwantedEffects.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.unwantedEffects.map((effect) => (
              <Badge
                key={effect}
                variant="outline"
                className="border-destructive/30 font-normal text-destructive"
              >
                {translateTag(effect, i18n.language)}
              </Badge>
            ))}
          </div>
        )}

        {/* Activities — private by default; owner can publish per session */}
        {session.activities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.activities.map((activity) => (
              <Badge
                key={activity}
                variant="outline"
                className="font-normal text-muted-foreground"
              >
                {translateTag(activity, i18n.language)}
              </Badge>
            ))}
          </div>
        )}

        {/* Notes excerpt */}
        {session.notes.trim().length > 0 && (
          <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
            {session.notes}
          </p>
        )}

        {/* Effect intensity radar — private, every intensity the owner set. */}
        {Object.keys(session.effectIntensities).length > 0 && (
          <EffectRadarChart
            intensities={session.effectIntensities}
            unwantedEffects={session.unwantedEffects}
            title={t("card.effectIntensity")}
          />
        )}

        {/* Energy / calm bipolar bar */}
        {session.energyCalmScore !== null && (
          <EnergyCalmBar
            score={session.energyCalmScore}
            title={t("card.energyCalm")}
          />
        )}

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex flex-col gap-3">
            {/* Public link */}
            <div className="flex items-center gap-2">
              <Switch
                id={`public-${session.id}`}
                checked={session.isPublic}
                onCheckedChange={() => onTogglePublic(session.id)}
                disabled={pending}
                aria-label={t("card.makePublicAria", { strain: strainName })}
              />
              <Label
                htmlFor={`public-${session.id}`}
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {t("card.publicLink")}
              </Label>
              <Link
                to={`/s/${encodeURIComponent(session.id)}`}
                className="pressable text-sm font-medium text-herb underline-offset-4 transition-colors duration-150 hover:underline"
              >
                {session.isPublic ? t("card.viewPublicCard") : t("card.viewCard")}
              </Link>
            </div>

            {/* Community feed */}
            <div className="flex items-center gap-2">
              <Switch
                id={`in-feed-${session.id}`}
                checked={session.inFeed}
                onCheckedChange={() => onToggleInFeed(session.id)}
                disabled={pending}
                aria-label={t("card.inFeedAria", { strain: strainName })}
              />
              <Label
                htmlFor={`in-feed-${session.id}`}
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {t("card.inFeed")}
              </Label>
            </div>

            {/* Content flags — always editable */}
            <div className="flex items-center gap-2">
              <Switch
                id={`unwanted-effects-public-${session.id}`}
                checked={session.unwantedEffectsPublic}
                onCheckedChange={() =>
                  onToggleUnwantedEffectsPublic(session.id)
                }
                disabled={pending}
                aria-label={t("card.includeUnwantedEffectsAria", {
                  strain: strainName,
                })}
              />
              <Label
                htmlFor={`unwanted-effects-public-${session.id}`}
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {session.unwantedEffectsPublic
                  ? t("card.unwantedEffectsPublic")
                  : t("card.unwantedEffectsPrivate")}
              </Label>
            </div>

            {session.activities.length > 0 && (
              <div className="flex items-center gap-2">
                <Switch
                  id={`activities-public-${session.id}`}
                  checked={session.activitiesPublic}
                  onCheckedChange={() =>
                    onToggleActivitiesPublic(session.id)
                  }
                  disabled={pending}
                  aria-label={t("card.includeActivitiesAria", {
                    strain: strainName,
                  })}
                />
                <Label
                  htmlFor={`activities-public-${session.id}`}
                  className="cursor-pointer text-sm text-muted-foreground"
                >
                  {session.activitiesPublic
                    ? t("card.activitiesPublic")
                    : t("card.activitiesPrivate")}
                </Label>
              </div>
            )}
          </div>

          <div className="flex items-center">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="pressable -mr-2 text-muted-foreground"
            >
              <Link to={logAgainTo}>{t("card.logAgain")}</Link>
            </Button>
            {/* Destructive, quiet: trash icon with a confirm dialog; the
                data layer drops the session from the cache, so the list
                updates in place without a reload. */}
            <DeleteSessionButton
              sessionId={session.id}
              strainName={strainName}
              variant="icon"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
