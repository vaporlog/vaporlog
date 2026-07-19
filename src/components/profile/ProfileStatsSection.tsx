import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProfileStats } from "@/lib/types";
import {
  displayDeviceName,
  displayStrainName,
  formatHours,
  formatWeekLabel,
} from "./profile-utils";

interface ProfileStatsSectionProps {
  stats: ProfileStats;
}

/** Top devices rendered in the bars list (rest stay in the collection). */
const TOP_DEVICES = 5;

/**
 * Private statistics — "only you can see this". Big, legible numbers on
 * quiet white cards; one recharts bar chart for the weekly rhythm; simple
 * bars for the top devices. Nothing here ever leaves this page: the public
 * profile carries a separate, much smaller stats block.
 */
export default function ProfileStatsSection({
  stats,
}: ProfileStatsSectionProps) {
  const { t } = useTranslation("profile");

  const weeklyData = useMemo(
    () =>
      stats.weekly.map((week) => ({
        label: formatWeekLabel(week.weekStart),
        count: week.count,
      })),
    [stats.weekly],
  );

  const topDevice = stats.devices[0] ?? null;
  const topStrain = stats.topStrains[0] ?? null;
  const barDevices = stats.devices.slice(0, TOP_DEVICES);
  const maxDeviceSessions = Math.max(
    1,
    ...barDevices.map((device) => device.sessions),
  );

  const cards = [
    { label: t("stats.total"), value: String(stats.totalSessions) },
    {
      label: t("stats.topDevice"),
      value: topDevice !== null ? displayDeviceName(topDevice.slug) : "—",
    },
    {
      label: t("stats.topStrain"),
      value: topStrain !== null ? displayStrainName(topStrain.slug) : "—",
    },
    { label: t("stats.totalHours"), value: formatHours(stats.totalMinutes) },
  ];

  return (
    <section aria-labelledby="profile-stats-heading" className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2
            id="profile-stats-heading"
            className="text-xl font-semibold tracking-tight"
          >
            {t("stats.title")}
          </h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="size-3.5" aria-hidden="true" />
            {t("stats.privateNote")}
          </span>
        </div>
      </header>

      {stats.totalSessions === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("stats.empty.title")}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("stats.empty.body")}
          </p>
          <Button
            asChild
            className="pressable herb-hover mt-1 bg-herb text-herb-foreground"
          >
            <Link to="/log">{t("stats.empty.cta")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Big-number cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-border/60 bg-card p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1 truncate text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          {/* Weekly rhythm */}
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <h3 className="text-sm font-medium text-foreground">
              {t("stats.weeklyTitle")}
            </h3>
            <div
              className="mt-3 h-44"
              role="img"
              aria-label={t("stats.chartTitle", {
                count: weeklyData.length,
              })}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeklyData}
                  margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                >
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--herb))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {stats.avgTemperatureC !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("stats.avgTemp", { value: stats.avgTemperatureC })}
              </p>
            )}
          </div>

          {/* Top devices as simple bars */}
          {barDevices.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <h3 className="text-sm font-medium text-foreground">
                {t("stats.devicesTitle")}
              </h3>
              <ul className="mt-3 space-y-3">
                {barDevices.map((device) => (
                  <li key={device.slug} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-foreground">
                        {displayDeviceName(device.slug)}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t("stats.sessionCount", { count: device.sessions })}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-herb"
                        style={{
                          width: `${Math.max(
                            (device.sessions / maxDeviceSessions) * 100,
                            3,
                          )}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
