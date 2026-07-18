/**
 * Feed slice — pure helpers for the /feed community sessions page.
 *
 * Kept local to the feed scope (no shared-lib changes): temperature zones,
 * display-name fallbacks for unknown (personal `my-*`) slugs, filter-option
 * derivation, and the filter predicate. Data comes in as arguments.
 *
 * NOTE: the strain catalog is lazy (see lib/data.ts `loadStrains`). The
 * display-name helpers read its in-memory cache and fall back to a
 * humanized slug until it loads — Feed.tsx calls `useStrains()` so the
 * feed re-renders with real names once the catalog arrives.
 */
import { getDevice, getStrain } from "@/lib/data";
import i18n from "@/i18n";
import type { SessionLog } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Temperature zones                                                   */
/* ------------------------------------------------------------------ */

/**
 * Vaporization temperature zones — the vaporlog/vaporium standard, with
 * EXACTLY these thresholds (same ones the log form's slider teaches):
 *   Low    < 170°C   (flavor range)
 *   Medium 170–190°C (balance point, inclusive)
 *   High   > 190°C   (maximum extraction)
 */
export type TempZone = "low" | "medium" | "high";

/** The zone filter's selectable values — "all" disables temperature filtering. */
export type ZoneFilter = "all" | TempZone;

/** Classifies a Celsius temperature into a vaporization zone. */
export function tempZone(celsius: number): TempZone {
  if (celsius < 170) return "low";
  if (celsius <= 190) return "medium";
  return "high";
}

/** Short label shown next to the temperature on a session card. */
export function tempZoneLabel(zone: TempZone): string {
  return i18n.t(`zones.${zone}`, { ns: "feed" });
}

/**
 * Zone filter choices with their thresholds spelled out for beginners.
 * `labelKey` is a `feed` namespace key so the filter row can re-render the
 * labels in the active language.
 */
export const ZONE_FILTER_OPTIONS: ReadonlyArray<{
  value: ZoneFilter;
  labelKey: string;
}> = [
  { value: "all", labelKey: "filters.zones.all" },
  { value: "low", labelKey: "filters.zones.low" },
  { value: "medium", labelKey: "filters.zones.medium" },
  { value: "high", labelKey: "filters.zones.high" },
];

/* ------------------------------------------------------------------ */
/* Display-name fallbacks                                              */
/* ------------------------------------------------------------------ */

/**
 * Humanize a slug that neither the curated catalog nor any readable
 * personal list can resolve (e.g. another account's `my-*` strain).
 * The `my-` prefix is stripped first, so "my-uncle-bob" displays as
 * "Uncle Bob", not "My Uncle Bob".
 */
function humanizeSlug(slug: string): string {
  const stripped = slug.startsWith("my-") ? slug.slice(3) : slug;
  const words = stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : slug;
}

/** Catalog strain name, or a humanized slug for personal/unknown strains. */
export function displayStrainName(slug: string): string {
  return getStrain(slug)?.name ?? humanizeSlug(slug);
}

/** Catalog device name, or a humanized slug for personal/unknown devices. */
export function displayDeviceName(slug: string): string {
  return getDevice(slug)?.name ?? humanizeSlug(slug);
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

/** Sentinel values for the "no filter" state of the device/mood selects. */
export const ALL_DEVICES = "all";
export const ALL_MOODS = "all";

/** The three combinable feed filters (AND semantics). */
export interface FeedFilterState {
  /** ALL_DEVICES or a deviceSlug. */
  device: string;
  zone: ZoneFilter;
  /** ALL_MOODS or an exact mood tag. */
  mood: string;
}

/** One device present in the feed data, resolved for display. */
export interface DeviceOption {
  slug: string;
  name: string;
}

/** Every device present in `sessions`, deduped and sorted by display name. */
export function deviceOptions(sessions: SessionLog[]): DeviceOption[] {
  const bySlug = new Map<string, string>();
  for (const session of sessions) {
    if (!bySlug.has(session.deviceSlug)) {
      bySlug.set(session.deviceSlug, displayDeviceName(session.deviceSlug));
    }
  }
  return Array.from(bySlug, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Every mood tag present in `sessions`, deduped and sorted A–Z. */
export function moodOptions(sessions: SessionLog[]): string[] {
  const moods = new Set<string>();
  for (const session of sessions) {
    for (const mood of session.moods) moods.add(mood);
  }
  return Array.from(moods).sort((a, b) => a.localeCompare(b));
}

/**
 * True when a session passes every active filter. Sessions with a null
 * temperature only survive the "all" zone — they have no zone to match.
 */
export function sessionMatchesFilters(
  session: SessionLog,
  filters: FeedFilterState,
): boolean {
  if (filters.device !== ALL_DEVICES && session.deviceSlug !== filters.device) {
    return false;
  }
  if (filters.zone !== "all") {
    if (session.temperatureC === null) return false;
    if (tempZone(session.temperatureC) !== filters.zone) return false;
  }
  if (filters.mood !== ALL_MOODS && !session.moods.includes(filters.mood)) {
    return false;
  }
  return true;
}

/** True when any filter is narrowed away from "all" (drives clear-filters). */
export function hasActiveFilters(filters: FeedFilterState): boolean {
  return (
    filters.device !== ALL_DEVICES ||
    filters.zone !== "all" ||
    filters.mood !== ALL_MOODS
  );
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** "8.5" — one decimal, no trailing ".0". */
export function formatRating(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** "May 2, 2026" — empty string for unparseable timestamps. Locale follows the active language. */
export function formatFeedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(i18n.language || "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
