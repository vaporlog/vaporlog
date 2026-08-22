import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";

interface EffectChartProps {
  /** Map of effect tag → intensity (1-10). */
  intensities: Record<string, number>;
  /**
   * Effect tags the user selected. Any tag missing from `intensities`
   * renders at 5 — the slider's resting value in the log form.
   */
  defaultEffects?: string[];
  /** Tags that are unwanted effects (rendered in red). */
  unwantedEffects?: string[];
  /** Optional title shown above the chart. */
  title?: string;
}

/**
 * Effect intensity chart. Three or more effects render as a spider/radar;
 * one or two render as horizontal 0-10 bars (same slice style as the
 * energy/calm bar), which read clearer with so few axes. Unwanted effects
 * render in destructive red; moods use herb. The card surface follows the
 * active theme (light/dark).
 */
export default function EffectChart({
  intensities,
  defaultEffects = [],
  unwantedEffects = [],
  title,
}: EffectChartProps) {
  const merged: Record<string, number> = { ...intensities };
  for (const tag of defaultEffects) {
    if (merged[tag] === undefined) merged[tag] = 5;
  }
  const entries = Object.entries(merged);
  if (entries.length === 0) return null;

  const unwanted = new Set(unwantedEffects);
  const data = entries.map(([effect, intensity]) => ({
    effect: translateTag(effect, i18n.language),
    moodIntensity: unwanted.has(effect) ? 0 : intensity,
    unwantedIntensity: unwanted.has(effect) ? intensity : 0,
    isUnwanted: unwanted.has(effect),
  }));

  const useRadar = data.length >= 3;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card p-4">
      {title ? (
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      ) : null}
      {useRadar ? (
        <div className="h-56 w-full max-w-xs">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="effect"
                tick={({ payload, x, y, textAnchor, ...rest }) => {
                  const color = unwanted.has(payload.value)
                    ? "hsl(var(--destructive))"
                    : "hsl(var(--muted-foreground))";
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor={textAnchor}
                      fontSize={11}
                      {...rest}
                      fill={color}
                      style={{ fill: color }}
                    >
                      {payload.value}
                    </text>
                  );
                }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                tick={false}
                axisLine={false}
              />
              <Radar
                name="mood"
                dataKey="moodIntensity"
                stroke="hsl(var(--herb))"
                fill="hsl(var(--herb))"
                fillOpacity={0.2}
              />
              <Radar
                name="unwanted"
                dataKey="unwantedIntensity"
                stroke="hsl(var(--destructive))"
                fill="hsl(var(--destructive))"
                fillOpacity={0.2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {data.map((entry) => {
            const intensity = entry.isUnwanted
              ? entry.unwantedIntensity
              : entry.moodIntensity;
            const pct = (intensity / 10) * 100;
            const colorClass = entry.isUnwanted
              ? "bg-destructive"
              : "bg-herb";
            const textClass = entry.isUnwanted
              ? "text-destructive"
              : "text-herb";
            return (
              <div key={entry.effect} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-sm font-medium ${
                      entry.isUnwanted
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {entry.effect}
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${textClass}`}
                  >
                    {intensity}/10
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full shadow ${colorClass}`}
                    style={{ left: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
