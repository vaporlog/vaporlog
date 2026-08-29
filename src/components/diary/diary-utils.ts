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

/* ------------------------------------------------------------------ */
/* Structured diary filters (the panel under the free-text search).   */
/* ------------------------------------------------------------------ */

export type LikedFilter = "all" | "liked" | "disliked";

export interface DiaryFiltersState {
  /** Strain slug, or "" for all. */
  strainSlug: string;
  /** Device slug, or "" for all. */
  deviceSlug: string;
  /** Minimum rating (1–10), or null for any. */
  minRating: number | null;
  liked: LikedFilter;
  /** Tag facets: a session matches when it carries ANY selected tag (OR
   *  within a facet, AND across facets). */
  aromas: string[];
  flavors: string[];
  moods: string[];
  /** Inclusive local-day bounds as YYYY-MM-DD, "" when unset. */
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_DIARY_FILTERS: DiaryFiltersState = {
  strainSlug: "",
  deviceSlug: "",
  minRating: null,
  liked: "all",
  aromas: [],
  flavors: [],
  moods: [],
  dateFrom: "",
  dateTo: "",
};

export function isDiaryFilterActive(f: DiaryFiltersState): boolean {
  return (
    f.strainSlug !== "" ||
    f.deviceSlug !== "" ||
    f.minRating !== null ||
    f.liked !== "all" ||
    f.aromas.length > 0 ||
    f.flavors.length > 0 ||
    f.moods.length > 0 ||
    f.dateFrom !== "" ||
    f.dateTo !== ""
  );
}

/** Count of active filter values — the toggle button shows it as a badge. */
export function countActiveDiaryFilters(f: DiaryFiltersState): number {
  let count = 0;
  if (f.strainSlug !== "") count += 1;
  if (f.deviceSlug !== "") count += 1;
  if (f.minRating !== null) count += 1;
  if (f.liked !== "all") count += 1;
  count += f.aromas.length + f.flavors.length + f.moods.length;
  if (f.dateFrom !== "" || f.dateTo !== "") count += 1;
  return count;
}

/**
 * Applies the structured filters with AND semantics across facets (OR among
 * the selected tags of one facet). Dates compare against local days, so
 * "hasta 2026-08-29" includes that whole day.
 */
export function applyDiaryFilters(
  sessions: SessionLog[],
  filters: DiaryFiltersState,
): SessionLog[] {
  if (!isDiaryFilterActive(filters)) return sessions;
  const fromTs = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00`).getTime()
    : null;
  const toTs = filters.dateTo
    ? new Date(`${filters.dateTo}T23:59:59.999`).getTime()
    : null;
  return sessions.filter((s) => {
    if (filters.strainSlug !== "" && s.strainSlug !== filters.strainSlug)
      return false;
    if (filters.deviceSlug !== "" && s.deviceSlug !== filters.deviceSlug)
      return false;
    if (filters.minRating !== null && s.rating < filters.minRating)
      return false;
    if (filters.liked === "liked" && s.liked !== true) return false;
    if (filters.liked === "disliked" && s.liked !== false) return false;
    if (
      filters.aromas.length > 0 &&
      !filters.aromas.some((tag) => s.aromas.includes(tag))
    )
      return false;
    if (
      filters.flavors.length > 0 &&
      !filters.flavors.some((tag) => s.flavors.includes(tag))
    )
      return false;
    if (
      filters.moods.length > 0 &&
      !filters.moods.some((tag) => s.moods.includes(tag))
    )
      return false;
    if (fromTs !== null || toTs !== null) {
      const ts = new Date(s.createdAt).getTime();
      if (Number.isNaN(ts)) return false;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    return true;
  });
}

/** A strain/device filter option with its session count. */
export interface NamedSlugOption {
  slug: string;
  name: string;
  count: number;
}

function slugOptions(
  sessions: SessionLog[],
  pick: (s: SessionLog) => string,
  display: (slug: string) => string,
): NamedSlugOption[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    counts.set(pick(s), (counts.get(pick(s)) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, name: display(slug), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Strains present in the diary, most-used first. */
export function diaryStrainOptions(sessions: SessionLog[]): NamedSlugOption[] {
  return slugOptions(sessions, (s) => s.strainSlug, displayStrainName);
}

/** Devices present in the diary, most-used first. */
export function diaryDeviceOptions(sessions: SessionLog[]): NamedSlugOption[] {
  return slugOptions(sessions, (s) => s.deviceSlug, displayDeviceName);
}

/**
 * Tags present in the diary for one facet (aromas/flavors/moods),
 * most-used first — a filter can never point at a tag the diary lacks.
 */
export function diaryTagOptions(
  sessions: SessionLog[],
  pick: (s: SessionLog) => string[],
): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    for (const tag of new Set(pick(s))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
