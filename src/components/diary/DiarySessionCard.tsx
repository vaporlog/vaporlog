import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
          <span className="shrink-0 text-sm font-semibold tabular-nums text-herb">
            {session.rating.toFixed(1)}
            <span className="font-normal text-muted-foreground">/10</span>
          </span>
        </div>

        {/* Device, parameters, date */}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {deviceName}
            {details.length > 0 && <span> · {details.join(" · ")}</span>}
          </p>
          <p className="text-xs">{formatSessionDate(session.createdAt)}</p>
        </div>

        {/* Moods */}
        {session.moods.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.moods.map((mood) => (
              <Badge key={mood} variant="secondary" className="font-normal">
                {mood}
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

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
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
              {session.isPublic ? t("card.public") : t("card.private")}
            </Label>
            {/* The card link works for private sessions too: /s/:id falls
                back to the owner's own sessions, so only they can open it. */}
            <Link
              to={`/s/${encodeURIComponent(session.id)}`}
              className="pressable text-sm font-medium text-herb underline-offset-4 transition-colors duration-150 hover:underline"
            >
              {session.isPublic ? t("card.viewPublicCard") : t("card.viewCard")}
            </Link>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="pressable -mr-2 text-muted-foreground"
          >
            <Link to={logAgainTo}>{t("card.logAgain")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
