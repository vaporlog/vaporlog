import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import {
  currentStreak,
  localDayKey,
  markDay,
  unmarkDay,
  useDetoxMarks,
} from "@/lib/detox";
import { cn } from "@/lib/utils";
import type { SessionLog } from "@/lib/types";

interface HighlightsRowProps {
  sessions: SessionLog[];
}

/**
 * The compact highlights row — three small tiles above the diary lists:
 * detox streak (tap to mark today; expand for the backfill calendar),
 * sessions this week, and the liked ratio. Keeps the detox streak glanceable
 * without giving it a full-width card.
 *
 * Tone contract: clean days are celebrated and ending a streak is a win
 * (a post-detox session is worth MORE) — the copy here never scolds.
 */
export function HighlightsRow({ sessions }: HighlightsRowProps) {
  const { t } = useTranslation("diary");
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Frozen at mount — keeps the rolling window stable across re-renders
  // (and the render pure).
  const [now] = useState(() => Date.now());

  const weekCount = useMemo(() => {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => new Date(s.createdAt).getTime() >= cutoff)
      .length;
  }, [sessions, now]);

  const likedPercent = useMemo(() => {
    const rated = sessions.filter((s) => s.liked !== null);
    if (rated.length === 0) return null;
    const liked = rated.filter((s) => s.liked === true).length;
    return Math.round((liked / rated.length) * 100);
  }, [sessions]);

  return (
    <section aria-label={t("detox.title")} className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <DetoxTile
          sessions={sessions}
          calendarOpen={calendarOpen}
          onToggleCalendar={() => setCalendarOpen((open) => !open)}
        />
        <HighlightTile label={t("highlights.thisWeek")} value={String(weekCount)} />
        <HighlightTile
          label={t("highlights.liked")}
          value={likedPercent === null ? "—" : `${likedPercent}%`}
        />
      </div>
      {calendarOpen ? <DetoxCalendar sessions={sessions} /> : null}
    </section>
  );
}

/** Small square tile: uppercase label + big value. */
function HighlightTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detox tile                                                          */
/* ------------------------------------------------------------------ */

interface DetoxTileProps {
  sessions: SessionLog[];
  calendarOpen: boolean;
  onToggleCalendar: () => void;
}

/**
 * The compact detox cell: flame + streak count, a one-tap "today was
 * clean" toggle, and the calendar expander. Session days always win —
 * with a session logged today there is nothing to mark.
 */
function DetoxTile({ sessions, calendarOpen, onToggleCalendar }: DetoxTileProps) {
  const { t } = useTranslation("diary");
  const { days: markedDays, loading } = useDetoxMarks();
  const [todayKey] = useState(() => localDayKey());

  const hasSessionToday = useMemo(
    () =>
      sessions.some((s) => localDayKey(new Date(s.createdAt)) === todayKey),
    [sessions, todayKey],
  );
  const streak = currentStreak(markedDays, hasSessionToday, todayKey);
  const todayMarked = markedDays.has(todayKey);

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between gap-1">
        <p className="flex items-center gap-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Flame className="size-3 shrink-0 text-herb" aria-hidden="true" />
          {t("detox.title")}
        </p>
        <button
          type="button"
          onClick={onToggleCalendar}
          aria-label={t("detox.calendar")}
          aria-expanded={calendarOpen}
          className={cn(
            "pressable -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
            calendarOpen
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarDays className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {loading ? "…" : streak}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {t("detox.streakUnit", { count: streak })}
        </span>
      </p>
      {hasSessionToday ? (
        <p className="mt-auto pt-1.5 text-[11px] text-muted-foreground">
          {t("detox.sessionToday")}
        </p>
      ) : (
        <button
          type="button"
          onClick={() =>
            todayMarked ? void unmarkDay(todayKey) : void markDay(todayKey)
          }
          aria-pressed={todayMarked}
          className={cn(
            "pressable mt-2 flex min-h-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors duration-150",
            todayMarked
              ? "border-herb bg-herb text-herb-foreground"
              : "border-dashed border-herb/50 text-herb hover:border-herb",
          )}
        >
          {todayMarked ? t("detox.todayClean") : t("detox.markToday")}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Expandable backfill calendar                                        */
/* ------------------------------------------------------------------ */

/**
 * Month grid for marking past clean days (unlimited backfill by product
 * decision). Days with a logged session carry a dot and are not markable.
 * Lives collapsed behind the tile's calendar button to keep the row small.
 */
function DetoxCalendar({ sessions }: { sessions: SessionLog[] }) {
  const { t, i18n } = useTranslation("diary");
  const { days: markedDays } = useDetoxMarks();
  const [todayKey] = useState(() => localDayKey());
  const [viewMonth, setViewMonth] = useState(() => todayKey.slice(0, 7));

  const sessionDays = useMemo(() => {
    const set = new Set<string>();
    for (const session of sessions) {
      set.add(localDayKey(new Date(session.createdAt)));
    }
    return set;
  }, [sessions]);

  const calendar = useMemo(() => {
    const [year, month] = viewMonth.split("-").map(Number);
    const daysInMonth = new Date(year!, month!, 0).getDate();
    // Monday-based offset of the 1st (getDay: 0=Sunday).
    const firstDow = (new Date(year!, month! - 1, 1).getDay() + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: firstDow }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(`${viewMonth}-${String(d).padStart(2, "0")}`);
    }
    return cells;
  }, [viewMonth]);

  const weekdays = useMemo(() => {
    // 2024-01-01 is a Monday — format a week of narrow names.
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      weekday: "narrow",
    });
    return Array.from({ length: 7 }, (_, i) =>
      formatter.format(new Date(2024, 0, 1 + i)),
    );
  }, [i18n.language]);

  const monthLabel = useMemo(() => {
    const [year, month] = viewMonth.split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, {
      month: "long",
      year: "numeric",
    }).format(new Date(year!, month! - 1, 1));
  }, [viewMonth, i18n.language]);

  const viewingCurrentMonth = viewMonth === todayKey.slice(0, 7);

  function shiftMonth(delta: number) {
    const [year, month] = viewMonth.split("-").map(Number);
    const date = new Date(year!, month! - 1 + delta, 1);
    setViewMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function toggleDay(day: string) {
    if (day > todayKey || sessionDays.has(day)) return;
    if (markedDays.has(day)) {
      void unmarkDay(day);
    } else {
      void markDay(day);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label={t("detox.prevMonth")}
          className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={viewingCurrentMonth}
          aria-label={t("detox.nextMonth")}
          className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {weekdays.map((day, index) => (
          <span
            key={index}
            className="py-1 text-center text-[11px] font-medium uppercase text-muted-foreground"
          >
            {day}
          </span>
        ))}
        {calendar.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />;
          const isFuture = day > todayKey;
          const hasSession = sessionDays.has(day);
          const marked = markedDays.has(day);
          const isToday = day === todayKey;
          const dayNum = Number(day.slice(-2));
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              disabled={isFuture || hasSession}
              aria-pressed={marked}
              aria-label={`${day}${marked ? ` — ${t("detox.cleanDay")}` : ""}`}
              title={hasSession ? t("detox.sessionDay") : undefined}
              className={cn(
                "pressable relative flex aspect-square items-center justify-center rounded-md text-xs tabular-nums transition-colors duration-150",
                marked
                  ? "bg-herb font-semibold text-herb-foreground"
                  : hasSession
                    ? "cursor-default font-medium text-herb"
                    : isFuture
                      ? "cursor-default text-muted-foreground/40"
                      : "text-foreground hover:bg-secondary",
                isToday && !marked && "ring-1 ring-foreground/40",
              )}
            >
              {dayNum}
              {hasSession ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 size-1 rounded-full bg-herb"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("detox.legend")}
      </p>
    </div>
  );
}
