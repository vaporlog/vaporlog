import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRating, type CommunityAverage } from "@/components/strains/strain-utils";
import type { Strain } from "@/lib/types";

interface StrainCardProps {
  strain: Strain;
  /** Community average; omit/undefined hides the rating row. */
  community?: CommunityAverage | null;
  /** Optional explainable-recommender reason ("Because you loved …"). */
  reason?: string;
}

/**
 * Compact strain summary card used by the catalog grid and the
 * recommendations list. Whole card is one link to the detail page.
 */
export default function StrainCard({ strain, community, reason }: StrainCardProps) {
  const { t } = useTranslation("strains");
  const topTerpenes = strain.terpenes.slice(0, 2);

  return (
    <Link
      to={`/strains/${strain.slug}`}
      className="pressable block rounded-xl"
      aria-label={t("card.viewAriaLabel", { name: strain.name })}
    >
      <Card className="vl-card-hover h-full gap-3 py-4">
        <CardHeader className="gap-1 px-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold leading-snug">
              {strain.name}
            </CardTitle>
            <Badge variant="outline" className="mt-0.5 shrink-0 text-muted-foreground">
              {strain.type}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium tabular-nums">THC {strain.thc}%</span>
            {strain.cbd > 0 && (
              <span className="text-muted-foreground tabular-nums">
                CBD {strain.cbd}%
              </span>
            )}
          </div>

          {topTerpenes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {topTerpenes.join(" · ")}
            </p>
          )}

          {community && (
            <p className="flex items-center gap-1.5 text-sm">
              <Star className="size-3.5 fill-herb text-herb" aria-hidden="true" />
              <span className="font-semibold text-herb tabular-nums">
                {formatRating(community.avg)}
              </span>
              <span className="text-muted-foreground">
                {t("card.community", { count: community.count })}
              </span>
            </p>
          )}

          {reason && (
            <p className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-sm text-muted-foreground">
              <Sparkles
                className="mt-0.5 size-3.5 shrink-0 text-herb"
                aria-hidden="true"
              />
              <span>{reason}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
