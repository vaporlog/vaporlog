import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import type { DiaryStats } from "./diary-utils";

interface StatsStripProps {
  stats: DiaryStats;
}

interface StatCell {
  label: string;
  value: string;
  highlight: boolean;
}

/** Four quiet stat cards; the average rating is the only accent-colored one. */
export function StatsStrip({ stats }: StatsStripProps) {
  const { t } = useTranslation("diary");
  const cells: StatCell[] = [
    {
      label: t("stats.total"),
      value: String(stats.totalSessions),
      highlight: false,
    },
    {
      label: t("stats.thisMonth"),
      value: String(stats.sessionsThisMonth),
      highlight: false,
    },
    {
      label: t("stats.avgRating"),
      value: stats.avgRating === null ? "—" : stats.avgRating.toFixed(1),
      highlight: stats.avgRating !== null,
    },
    {
      label: t("stats.gramsThisMonth"),
      value:
        stats.gramsThisMonth === null
          ? "—"
          : `${Number(stats.gramsThisMonth.toFixed(2))} g`,
      highlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <Card key={cell.label} className="shadow-xs">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {cell.label}
            </p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                cell.highlight ? "text-herb" : "text-foreground"
              }`}
            >
              {cell.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
