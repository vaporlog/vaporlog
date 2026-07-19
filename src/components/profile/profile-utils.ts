/**
 * Profile slice — pure display helpers (private /profile + public /u/:handle).
 *
 * Kept local to the profile scope (mirrors components/feed/feed-utils.ts):
 * display-name fallbacks read the in-memory strain/device caches and
 * humanize unknown (personal `my-*`) slugs; date/number formatters follow
 * the active i18n language. Data comes in as arguments.
 */
import { getDevice, getStrain } from "@/lib/data";
import i18n from "@/i18n";

/**
 * Humanize a slug that neither catalog resolves (e.g. a personal `my-*`
 * device or strain). The `my-` prefix is stripped first.
 */
function humanizeSlug(slug: string): string {
  const stripped = slug.startsWith("my-") ? slug.slice(3) : slug;
  const words = stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : slug;
}

/** Catalog device name, or a humanized slug for personal/unknown devices. */
export function displayDeviceName(slug: string): string {
  return getDevice(slug)?.name ?? humanizeSlug(slug);
}

/** Catalog strain name, or a humanized slug for personal/unknown strains. */
export function displayStrainName(slug: string): string {
  return getStrain(slug)?.name ?? humanizeSlug(slug);
}

/** "March 2026" — month + year, locale follows the active language. */
export function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(i18n.language || "en-US", {
    month: "long",
    year: "numeric",
  });
}

/** "12.5" — minutes → hours, one decimal, trailing ".0" stripped. */
export function formatHours(totalMinutes: number): string {
  return (totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
}

/** "May 4" — short label for a week bucket ('YYYY-MM-DD' week start). */
export function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return date.toLocaleDateString(i18n.language || "en-US", {
    month: "short",
    day: "numeric",
  });
}
