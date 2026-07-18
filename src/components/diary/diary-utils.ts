/**
 * Diary slice — pure helpers for stats, favorites, weekly activity and
 * display formatting. Kept local to the diary scope (no shared-lib changes).
 *
 * NOTE: the strain catalog is lazy (see lib/data.ts `loadStrains`). The
 * display-name helpers read its in-memory cache and fall back to a
 * humanized slug until it loads — Diary.tsx calls `useStrains()` so cards
 * re-render with real names (and catalog links) once the catalog arrives.
 */
import { getDevice, getStrain } from "@/lib/data";
import i18n from "@/i18n";
import type { SessionLog } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** BCP-47 locale for date formatting, derived from the active UI language. */
function dateLocale(): string {
  return i18n.language?.startsWith("es") ? "es-MX" : "en-US";
}

/** Humanize a slug when it is not part of the catalog (private strain/device).
 *  Personal slugs carry a `my-` prefix (see the log slice's personal.ts) that
 *  is stripped first, so "my-uncle-bob" displays as "Uncle Bob", not "My Uncle Bob". */
function humanizeSlug(slug: string): string {
  const stripped = slug.startsWith("my-") ? slug.slice(3) : slug;
  return stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Catalog strain name, or a humanized slug for private strains. */
export function displayStrainName(slug: string): string {
  return getStrain(slug)?.name ?? humanizeSlug(slug);
}

/** Catalog device name, or a humanized slug for private devices. */
export function displayDeviceName(slug: string): string {
  return getDevice(slug)?.name ?? humanizeSlug(slug);
}

/** Whether the strain slug belongs to the global catalog (linkable). */
export function isCatalogStrain(slug: string): boolean {
  return getStrain(slug) !== undefined;
}

/** e.g. "Sun, Mar 2 · 8:45 PM". Defensive against unparseable timestamps. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return i18n.t("diary:unknownDate");
  const locale = dateLocale();
  const day = date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

export interface DiaryStats {
  totalSessions: number;
  sessionsThisMonth: number;
  /** Average rating across all sessions, null when there are none. */
  avgRating: number | null;
  /** Sum of amountG for the current month, null when every entry is null. */
  gramsThisMonth: number | null;
}

export function computeStats(
  sessions: SessionLog[],
  now: Date = new Date(),
): DiaryStats {
  const month = now.getMonth();
  const year = now.getFullYear();

  let sessionsThisMonth = 0;
  let ratingSum = 0;
  let grams = 0;
  let hasGramsThisMonth = false;

  for (const session of sessions) {
    ratingSum += session.rating;
    const date = new Date(session.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getMonth() === month && date.getFullYear() === year) {
      sessionsThisMonth += 1;
      if (session.amountG !== null) {
        grams += session.amountG;
        hasGramsThisMonth = true;
      }
    }
  }

  return {
    totalSessions: sessions.length,
    sessionsThisMonth,
    avgRating: sessions.length > 0 ? ratingSum / sessions.length : null,
    gramsThisMonth: hasGramsThisMonth ? grams : null,
  };
}

export interface FavoriteStrain {
  strainSlug: string;
  sessions: number;
  avgRating: number;
}

/** Top strains by the user's average rating (min 1 session), ties broken by count. */
export function computeFavorites(
  sessions: SessionLog[],
  limit = 5,
): FavoriteStrain[] {
  const byStrain = new Map<string, { count: number; ratingSum: number }>();
  for (const session of sessions) {
    const entry = byStrain.get(session.strainSlug) ?? {
      count: 0,
      ratingSum: 0,
    };
    entry.count += 1;
    entry.ratingSum += session.rating;
    byStrain.set(session.strainSlug, entry);
  }
  return Array.from(byStrain.entries())
    .map(([strainSlug, entry]) => ({
      strainSlug,
      sessions: entry.count,
      avgRating: entry.ratingSum / entry.count,
    }))
    .sort((a, b) => b.avgRating - a.avgRating || b.sessions - a.sessions)
    .slice(0, limit);
}

export interface WeekBucket {
  /** Short label like "Mar 2" (the Monday the week starts). */
  label: string;
  /** Inclusive start of the week (local midnight Monday). */
  start: Date;
  count: number;
}

/** Sessions per week for the last `weeks` weeks, oldest first (Monday-based). */
export function computeWeeklyActivity(
  sessions: SessionLog[],
  weeks = 8,
  now: Date = new Date(),
): WeekBucket[] {
  // Local midnight today, shifted back to this week's Monday.
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (currentMonday.getDay() + 6) % 7;
  currentMonday.setDate(currentMonday.getDate() - daysSinceMonday);

  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(currentMonday);
    start.setDate(currentMonday.getDate() - i * 7);
    buckets.push({
      label: start.toLocaleDateString(dateLocale(), {
        month: "short",
        day: "numeric",
      }),
      start,
      count: 0,
    });
  }

  const firstStart = buckets[0]?.start.getTime() ?? 0;
  for (const session of sessions) {
    const date = new Date(session.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((day.getTime() - firstStart) / DAY_MS);
    const index = Math.floor(diffDays / 7);
    if (index >= 0 && index < buckets.length) {
      buckets[index].count += 1;
    }
  }
  return buckets;
}

/** Dot-separated session parameters, skipping null values gracefully. */
export function sessionDetailParts(session: SessionLog): string[] {
  const parts: string[] = [];
  if (session.temperatureC !== null) parts.push(`${session.temperatureC}°C`);
  if (session.durationMin !== null) parts.push(`${session.durationMin} min`);
  if (session.amountG !== null) parts.push(`${session.amountG} g`);
  return parts;
}
