/**
 * Shared helpers for the strains slice (catalog, detail, recommendations).
 * Pure functions only — data comes in as arguments.
 */
import i18n from "@/i18n";
import type { SessionLog, Strain } from "@/lib/types";

/** Community average for one strain, or `null` when it has no sessions. */
export interface CommunityAverage {
  avg: number;
  count: number;
}

/** All community sessions logged with one strain, newest first. */
export function communitySessionsFor(
  strainSlug: string,
  communitySessions: SessionLog[],
): SessionLog[] {
  return communitySessions
    .filter((s) => s.strainSlug === strainSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Average community rating for one strain; `null` when unknown. */
export function communityAverage(
  strainSlug: string,
  communitySessions: SessionLog[],
): CommunityAverage | null {
  const sessions = communitySessions.filter((s) => s.strainSlug === strainSlug);
  if (sessions.length === 0) return null;
  const sum = sessions.reduce((total, s) => total + s.rating, 0);
  return { avg: sum / sessions.length, count: sessions.length };
}

/**
 * Pre-computes community averages for every strain slug that has sessions.
 * Use this in list views to avoid re-scanning sessions per card.
 */
export function communityAverageMap(
  communitySessions: SessionLog[],
): Map<string, CommunityAverage> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const session of communitySessions) {
    const entry = totals.get(session.strainSlug) ?? { sum: 0, count: 0 };
    entry.sum += session.rating;
    entry.count += 1;
    totals.set(session.strainSlug, entry);
  }
  const map = new Map<string, CommunityAverage>();
  for (const [slug, { sum, count }] of totals) {
    map.set(slug, { avg: sum / count, count });
  }
  return map;
}

/** Case-insensitive search across the fields a connoisseur actually types. */
export function strainMatchesQuery(strain: Strain, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    strain.name.toLowerCase().includes(q) ||
    strain.terpenes.some((t) => t.toLowerCase().includes(q)) ||
    strain.effects.some((e) => e.toLowerCase().includes(q)) ||
    strain.aromas.some((a) => a.toLowerCase().includes(q))
  );
}

/** "8.5" — one decimal, no trailing ".0". */
export function formatRating(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Formats a session timestamp ("2026-05-02T09:30:00-06:00") for display. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(i18n.language || "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
