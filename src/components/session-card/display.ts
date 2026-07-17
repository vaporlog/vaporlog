/**
 * Display-name helpers for the public session card.
 *
 * A shared session can reference a PERSONAL strain or device (`my-*` slugs
 * created in the log slice) that the curated catalog cannot resolve. The
 * card must still show a real name and must never link to a /strains/:slug
 * page that cannot exist for a personal entry.
 *
 * Resolution order:
 *   1. Catalog (getStrain / getDevice — reads the lazy catalog cache;
 *      unresolved until `loadStrains()` has completed, so pages using these
 *      helpers call `useStrains()` to re-render once the catalog lands)
 *   2. Personal entries in localStorage (exact name, same device)
 *   3. Humanized slug (shared link viewed on another device)
 */
import { getDevice, getStrain } from "@/lib/data";
import {
  getPersonalDevices,
  getPersonalStrains,
  isPersonalSlug,
} from "@/components/log/personal";

/** "my-uncle-bob" → "Uncle Bob" (last-resort fallback for unknown slugs). */
function humanizeSlug(slug: string): string {
  const stripped = isPersonalSlug(slug) ? slug.slice("my-".length) : slug;
  const words = stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : slug;
}

/** Catalog or personal strain name; humanized slug as the last resort. */
export function displayStrainName(slug: string): string {
  const catalog = getStrain(slug);
  if (catalog) return catalog.name;
  const personal = getPersonalStrains().find((s) => s.slug === slug);
  if (personal) return personal.name;
  return humanizeSlug(slug);
}

/** Catalog or personal device name; humanized slug as the last resort. */
export function displayDeviceName(slug: string): string {
  const catalog = getDevice(slug);
  if (catalog) return catalog.name;
  const personal = getPersonalDevices().find((d) => d.slug === slug);
  if (personal) return personal.name;
  return humanizeSlug(slug);
}

/** True only when /strains/:slug can actually render this strain. */
export function isCatalogStrain(slug: string): boolean {
  return getStrain(slug) !== undefined;
}
