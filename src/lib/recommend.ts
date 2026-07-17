/**
 * vaporlog — explainable content-based recommender (spec decision 7, phase 1).
 *
 * PURE module: no I/O, no React, no localStorage. Callers pass in sessions
 * and the catalog; every function is deterministic for the same input.
 *
 * Algorithm
 * ---------
 * 1. Take the user's sessions rated >= {@link LOVE_THRESHOLD} (8/10).
 * 2. Resolve each to its catalog strain and build a preference profile:
 *      - terpenes        weight 2
 *      - effects         weight 3  (effects say the most about a session)
 *      - aromas+flavors  weight 1  (strain aromas + the session's own tags)
 *    Each occurrence of a tag adds its weight once per loved strain/session.
 * 3. Score every catalog strain the user has NOT logged (any rating) by
 *    weighted overlap with the preference profile.
 * 4. Return the top N with a HUMAN reason string naming the loved strain
 *    that drove the match plus the overlapping terpenes/effects — the
 *    recommender is always explainable ("Because you loved OG Kush —
 *    myrcene + relaxing vibes").
 */
import type { SessionLog, Strain } from "@/lib/types";

/** Minimum rating (1–10) for a session to count as "loved". */
export const LOVE_THRESHOLD = 8;

/** Default number of recommendations returned. */
export const DEFAULT_RECOMMENDATION_LIMIT = 6;

/** Category weights — effects dominate, tasting notes refine. */
export const WEIGHTS = {
  terpene: 2,
  effect: 3,
  note: 1,
} as const;

/** A scored, explainable recommendation. */
export interface Recommendation {
  strain: Strain;
  /** Weighted overlap score (higher = better match). */
  score: number;
  /** Human explanation, e.g. "Because you loved OG Kush — myrcene + relaxing vibes". */
  reason: string;
  /** Overlapping terpenes, strongest preference first. */
  matchedTerpenes: string[];
  /** Overlapping effects, strongest preference first. */
  matchedEffects: string[];
  /** Overlapping aromas/flavors, strongest preference first. */
  matchedNotes: string[];
  /** Name of the loved strain that contributed most to this match. */
  becauseOf: string;
}

/** A community-loved strain used as the cold-start fallback. */
export interface CommunityPick {
  strain: Strain;
  /** Average community rating (1–10). */
  avgRating: number;
  /** Number of community sessions behind the average. */
  sessionCount: number;
}

/** Weighted tag multiset — keys are normalized (lowercase, trimmed). */
type TagWeights = Map<string, number>;

interface PreferenceProfile {
  terpenes: TagWeights;
  effects: TagWeights;
  notes: TagWeights;
}

/** One loved strain resolved from the user's highly-rated sessions. */
interface LovedStrain {
  strain: Strain;
  /** Best rating the user gave this strain. */
  maxRating: number;
  terpenes: Set<string>;
  effects: Set<string>;
  notes: Set<string>;
}

/** Case/whitespace-insensitive tag key. */
function norm(tag: string): string {
  return tag.trim().toLowerCase();
}

function addTag(map: TagWeights, tag: string, weight: number): void {
  const key = norm(tag);
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/** Lowercases the first character ("Relaxing" → "relaxing") for reason prose. */
function lowercaseFirst(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}

/**
 * Sessions that count as taste signal: rated >= {@link LOVE_THRESHOLD}.
 * Pure filter — does not require the strain to exist in the catalog.
 */
export function getLovedSessions(sessions: SessionLog[]): SessionLog[] {
  return sessions.filter((s) => s.rating >= LOVE_THRESHOLD);
}

/**
 * Builds the weighted preference profile from loved sessions.
 * Sessions whose strain is not in the catalog (e.g. private strains) are
 * skipped for tag extraction but their flavors still count via the caller
 * passing the full session list — here they are simply ignored.
 */
export function buildPreferenceProfile(
  sessions: SessionLog[],
  catalog: Strain[],
): PreferenceProfile {
  const profile: PreferenceProfile = {
    terpenes: new Map(),
    effects: new Map(),
    notes: new Map(),
  };
  const bySlug = new Map(catalog.map((s) => [s.slug, s]));

  for (const session of getLovedSessions(sessions)) {
    const strain = bySlug.get(session.strainSlug);
    if (!strain) continue;
    for (const t of strain.terpenes) addTag(profile.terpenes, t, WEIGHTS.terpene);
    for (const e of strain.effects) addTag(profile.effects, e, WEIGHTS.effect);
    for (const a of strain.aromas) addTag(profile.notes, a, WEIGHTS.note);
    // The session's own tasting tags refine the profile at note weight.
    for (const a of session.aromas) addTag(profile.notes, a, WEIGHTS.note);
    for (const f of session.flavors) addTag(profile.notes, f, WEIGHTS.note);
  }
  return profile;
}

/** Resolves the loved strains behind the profile (deduped by slug). */
function getLovedStrains(sessions: SessionLog[], catalog: Strain[]): LovedStrain[] {
  const bySlug = new Map(catalog.map((s) => [s.slug, s]));
  const loved = new Map<string, LovedStrain>();

  for (const session of getLovedSessions(sessions)) {
    const strain = bySlug.get(session.strainSlug);
    if (!strain) continue;
    const existing = loved.get(strain.slug);
    if (existing) {
      existing.maxRating = Math.max(existing.maxRating, session.rating);
      for (const a of session.aromas) existing.notes.add(norm(a));
      for (const f of session.flavors) existing.notes.add(norm(f));
    } else {
      loved.set(strain.slug, {
        strain,
        maxRating: session.rating,
        terpenes: new Set(strain.terpenes.map(norm)),
        effects: new Set(strain.effects.map(norm)),
        notes: new Set([
          ...strain.aromas.map(norm),
          ...session.aromas.map(norm),
          ...session.flavors.map(norm),
        ]),
      });
    }
  }
  return [...loved.values()];
}

/** Weighted overlap of one candidate's tag list against the profile. */
function overlap(
  tags: string[],
  weights: TagWeights,
  weight: number,
): { score: number; matched: { name: string; weight: number }[] } {
  let score = 0;
  const matched: { name: string; weight: number }[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const key = norm(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    const preference = weights.get(key);
    if (preference !== undefined) {
      score += preference * weight;
      matched.push({ name: tag, weight: preference * weight });
    }
  }
  matched.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  return { score, matched };
}

/** How much one loved strain explains a candidate (for the reason string). */
function lovedContribution(loved: LovedStrain, candidate: Strain): number {
  let contribution = 0;
  for (const t of candidate.terpenes) {
    if (loved.terpenes.has(norm(t))) contribution += WEIGHTS.terpene;
  }
  for (const e of candidate.effects) {
    if (loved.effects.has(norm(e))) contribution += WEIGHTS.effect;
  }
  for (const a of candidate.aromas) {
    if (loved.notes.has(norm(a))) contribution += WEIGHTS.note;
  }
  return contribution;
}

/** Builds the human explanation for a match. Always returns non-empty. */
export function buildReason(
  becauseOf: string,
  matchedTerpenes: string[],
  matchedEffects: string[],
  matchedNotes: string[],
): string {
  const terpenes = matchedTerpenes.slice(0, 2).join(", ");
  const effects = matchedEffects.slice(0, 2).map(lowercaseFirst).join(", ");
  const notes = matchedNotes.slice(0, 2).map(lowercaseFirst).join(", ");

  let detail: string;
  if (terpenes && effects) {
    detail = `${terpenes} + ${effects} vibes`;
  } else if (terpenes) {
    detail = `the ${terpenes} profile`;
  } else if (effects) {
    detail = `${effects} vibes`;
  } else if (notes) {
    detail = `${notes} notes`;
  } else {
    detail = "a similar overall character";
  }
  return `Because you loved ${becauseOf} — ${detail}`;
}

/**
 * Scores every catalog strain the user has never logged and returns the
 * top `limit` matches (score > 0), best first. Returns `[]` when the user
 * has no loved sessions or nothing overlaps — callers should fall back to
 * {@link getCommunityTopStrains} for the cold start.
 */
export function getRecommendations(
  sessions: SessionLog[],
  catalog: Strain[],
  limit: number = DEFAULT_RECOMMENDATION_LIMIT,
): Recommendation[] {
  const loved = getLovedStrains(sessions, catalog);
  if (loved.length === 0) return [];

  const profile = buildPreferenceProfile(sessions, catalog);
  const loggedSlugs = new Set(sessions.map((s) => s.strainSlug));

  const scored: Recommendation[] = [];
  for (const strain of catalog) {
    if (loggedSlugs.has(strain.slug)) continue;

    const terpenes = overlap(strain.terpenes, profile.terpenes, WEIGHTS.terpene);
    const effects = overlap(strain.effects, profile.effects, WEIGHTS.effect);
    const notes = overlap(strain.aromas, profile.notes, WEIGHTS.note);
    const score = terpenes.score + effects.score + notes.score;
    if (score <= 0) continue;

    let becauseOf = loved[0].strain.name;
    let bestContribution = -1;
    for (const candidate of loved) {
      const contribution = lovedContribution(candidate, strain);
      if (contribution > bestContribution) {
        bestContribution = contribution;
        becauseOf = candidate.strain.name;
      }
    }

    const matchedTerpenes = terpenes.matched.map((m) => m.name);
    const matchedEffects = effects.matched.map((m) => m.name);
    const matchedNotes = notes.matched.map((m) => m.name);

    scored.push({
      strain,
      score,
      reason: buildReason(becauseOf, matchedTerpenes, matchedEffects, matchedNotes),
      matchedTerpenes,
      matchedEffects,
      matchedNotes,
      becauseOf,
    });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.strain.name.localeCompare(b.strain.name),
  );
  return scored.slice(0, Math.max(0, limit));
}

/**
 * Cold-start fallback: catalog strains ranked by average community rating
 * (only strains that have at least one community session). Ties break by
 * session count, then name.
 */
export function getCommunityTopStrains(
  catalog: Strain[],
  communitySessions: SessionLog[],
  limit: number = 4,
): CommunityPick[] {
  const bySlug = new Map(catalog.map((s) => [s.slug, s]));
  const totals = new Map<string, { sum: number; count: number }>();

  for (const session of communitySessions) {
    if (!bySlug.has(session.strainSlug)) continue;
    const entry = totals.get(session.strainSlug) ?? { sum: 0, count: 0 };
    entry.sum += session.rating;
    entry.count += 1;
    totals.set(session.strainSlug, entry);
  }

  const picks: CommunityPick[] = [];
  for (const [slug, { sum, count }] of totals) {
    const strain = bySlug.get(slug);
    if (!strain || count === 0) continue;
    picks.push({ strain, avgRating: sum / count, sessionCount: count });
  }

  picks.sort(
    (a, b) =>
      b.avgRating - a.avgRating ||
      b.sessionCount - a.sessionCount ||
      a.strain.name.localeCompare(b.strain.name),
  );
  return picks.slice(0, Math.max(0, limit));
}
