/**
 * vaporlog — shared data contract.
 *
 * These types are the merge point between every agent building this app.
 * DO NOT change field names, field types, or nullability without changing
 * the seed data, the vocab data, and every consumer in the same commit.
 */

/** Curated global strain catalog entry (imported from vaporium frontmatter). */
export interface Strain {
  slug: string;
  name: string;
  type: "Indica" | "Sativa" | "Hybrid";
  /** THC percentage (e.g. 18 means 18%). */
  thc: number;
  /** CBD percentage. */
  cbd: number;
  terpenes: string[];
  aromas: string[];
  effects: string[];
  /** e.g. "Chemdawg x Hindu Kush". */
  lineage: string;
  /** Optional external reference (e.g. Leafly URL). */
  link?: string;
}

/** Vaporizer device catalog entry. */
export interface Device {
  slug: string;
  name: string;
}

/** A single vaporization session entry (yours or a public community one). */
export interface SessionLog {
  id: string;
  strainSlug: string;
  deviceSlug: string;
  temperatureC: number | null;
  durationMin: number | null;
  amountG: number | null;
  /** 1–10. */
  rating: number;
  aromas: string[];
  flavors: string[];
  moods: string[];
  activities: string[];
  notes: string;
  isPublic: boolean;
  /** Pseudonym — never a real name or email. */
  author: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Shape of src/data/seed.json (strains + devices only). */
export interface SeedData {
  strains: Strain[];
  devices: Device[];
}

/**
 * Shape of src/data/demo-sessions.json — the 20 demo community sessions.
 * DEV-only fixture data; never shipped in production builds (see
 * lib/data.ts, where the import is gated behind `import.meta.env.DEV`).
 */
export interface DemoSessionsData {
  communitySessions: SessionLog[];
}

/**
 * Shape of src/data/vocab.json — controlled vocabularies, sorted unique,
 * Title Case. Comparability over freedom: prefer these tags, custom tags
 * are opt-in extras.
 */
export interface Vocab {
  aromas: string[];
  flavors: string[];
  moods: string[];
  activities: string[];
  effects: string[];
}

/** Local user profile (age gate + pseudonym). Stored in localStorage. */
export interface Profile {
  username: string;
  /** ISO date (YYYY-MM-DD) — age gate 21+. */
  birthdate: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}
