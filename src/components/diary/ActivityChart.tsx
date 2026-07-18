import { useTranslation } from "react-i18next";
import type { WeekBucket } from "./diary-utils";

interface ActivityChartProps {
  weeks: WeekBucket[];
}

const VIEW_W = 560;
const VIEW_H = 200;
const PAD_TOP = 28; // room for count labels
const PAD_BOTTOM = 32; // room for week labels
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const ZERO_BAR_H = 3;
const CORNER_R = 6;

/** SVG path for a bar with rounded top corners only. */
function roundedTopBar(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, height);
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    "Z",
  ].join(" ");
}

/**
 * Sessions per week for the last 8 weeks — hand-rolled SVG bar chart,
 * no dependencies. Herb bars with rounded tops; zero weeks get a quiet
 * baseline tick. Fully labeled for screen readers.
 */
export function ActivityChart({ weeks }: ActivityChartProps) {
  const { t } = useTranslation("diary");
  if (weeks.length === 0) return null;

  const max = Math.max(1, ...weeks.map((week) => week.count));
  const slot = VIEW_W / weeks.length;
  const barWidth = Math.min(48, slot * 0.55);
  const baselineY = PAD_TOP + PLOT_H;

  return (
    <section aria-labelledby="diary-activity-heading" className="space-y-3">
      <h2
        id="diary-activity-heading"
        className="text-lg font-semibold tracking-tight"
      >
        {t("activity.title")}
      </h2>
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-labelledby="diary-activity-chart-title"
        >
          <title id="diary-activity-chart-title">
            {t("activity.chartTitle", { count: weeks.length })}
          </title>

          {/* Baseline */}
          <line
            x1={0}
            x2={VIEW_W}
            y1={baselineY + 0.5}
            y2={baselineY + 0.5}
            className="stroke-border"
            strokeWidth={1}
          />

          {weeks.map((week, index) => {
            const x = slot * index + (slot - barWidth) / 2;
            const isZero = week.count === 0;
            const barH = isZero
              ? ZERO_BAR_H
              : Math.max((week.count / max) * PLOT_H, 8);
            const y = baselineY - barH;
            const label = t("activity.barLabel", {
              count: week.count,
              week: week.label,
            });

            return (
              <g key={week.label}>
                <title>{label}</title>
                {isZero ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={CORNER_R / 2}
                    className="fill-secondary"
                  />
                ) : (
                  <path
                    d={roundedTopBar(x, y, barWidth, barH, CORNER_R)}
                    className="fill-herb"
                  />
                )}
                <text
                  x={x + barWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  className="fill-foreground text-[12px] font-medium tabular-nums"
                >
                  {week.count}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={baselineY + 20}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {week.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
