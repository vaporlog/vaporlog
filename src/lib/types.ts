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
  /**
   * Catalog grouping (e.g. "Portable", "Desktop", "Butane/Torch",
   * "Ball Vape"). Present on API-served entries (GET /api/devices);
   * absent on the bundled offline fallback (seed.json) and on personal
   * devices — treat it as optional everywhere.
   */
  category?: string;
  /** Server-defined ordering within the catalog (ascending). */
  sortOrder?: number;
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

/* ------------------------------------------------------------------ */
/* User profile (profile page + public profile) — mirrors the shapes  */
/* served by /api/profile* and /api/u/:handle (server/src/routes/     */
/* profile.js). camelCase both ways; the API owns the row mapping.    */
/* ------------------------------------------------------------------ */

/** The signed-in user's full profile settings (GET /api/profile). */
export interface ProfileSettings {
  handle: string;
  bio: string;
  /** Master switch: the public page exists only while true. */
  isPublic: boolean;
  /** Per-block public flags (each only matters while isPublic is true). */
  publicStats: boolean;
  publicReviews: boolean;
  publicCollection: boolean;
  /** Catalog device slug, or null when no favorite is set. */
  favoriteDeviceSlug: string | null;
  /** ISO 8601 timestamp of account creation. */
  memberSince: string;
}

/** Fields PATCH /api/profile accepts (all optional). */
export interface ProfilePatch {
  bio?: string;
  isPublic?: boolean;
  publicStats?: boolean;
  publicReviews?: boolean;
  publicCollection?: boolean;
  favoriteDeviceSlug?: string | null;
}

/** One device review (1–5 + text); one per device per user. */
export interface DeviceReview {
  deviceSlug: string;
  /** Catalog device name, or null for non-catalog (personal `my-*`) slugs. */
  deviceName: string | null;
  /** Whole number 1–5. */
  rating: number;
  body: string;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Per-device usage aggregate (private stats). */
export interface ProfileDeviceStat {
  slug: string;
  /** Catalog device name, or null for non-catalog slugs. */
  name: string | null;
  sessions: number;
  totalMinutes: number;
  avgTemperatureC: number | null;
}

/** One strain in the top-strains ranking (private stats). */
export interface ProfileStrainStat {
  slug: string;
  count: number;
}

/** One week in the sessions-per-week series (private stats). */
export interface ProfileWeekBucket {
  /** ISO date (YYYY-MM-DD) of the week start (Monday). */
  weekStart: string;
  count: number;
}

/** Private statistics (GET /api/profile/stats) — never public as-is. */
export interface ProfileStats {
  totalSessions: number;
  totalMinutes: number;
  avgTemperatureC: number | null;
  devices: ProfileDeviceStat[];
  topStrains: ProfileStrainStat[];
  weekly: ProfileWeekBucket[];
}

/** A device referenced by name on public surfaces. */
export interface PublicDeviceRef {
  slug: string;
  name: string;
}

/** One device in a public collection: counts only, never grams/hours. */
export interface PublicCollectionEntry {
  slug: string;
  name: string | null;
  sessions: number;
  favorite: boolean;
}

/**
 * The public profile payload (GET /api/u/:handle). The optional blocks are
 * present only while their privacy flag is on. Grams and hours NEVER
 * appear here — stats carries only a session count and a device reference.
 */
export interface PublicProfile {
  handle: string;
  bio: string;
  /** ISO 8601 timestamp of account creation. */
  memberSince: string;
  favoriteDevice?: PublicDeviceRef;
  /** Only sessions the owner individually published. */
  sessions: SessionLog[];
  stats?: {
    totalSessions: number;
    favoriteDevice: PublicDeviceRef | null;
  };
  reviews?: DeviceReview[];
  collection?: PublicCollectionEntry[];
}
