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
  /** Tags from the controlled unwanted-effects vocabulary + custom additions. */
  unwantedEffects: string[];
  /** Optional thumbs-up / thumbs-down sentiment. null = not answered. */
  liked: boolean | null;
  /** Whether unwantedEffects are included when the session is published. */
  unwantedEffectsPublic: boolean;
  notes: string;
  isPublic: boolean;
  /** Pseudonym — never a real name or email. */
  author: string;
  /**
   * Whether the author's profile is publicly visible at /u/:handle.
   * Optional: only public-feed payloads (GET /api/sessions/public) carry
   * it — private endpoints (e.g. /api/sessions/mine) omit it entirely.
   * When true, surfaces may link the handle to the public profile.
   */
  authorProfilePublic?: boolean;
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
  unwantedEffects: string[];
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
  /** Percentage of sessions with liked=true among sessions where liked was set. */
  likedPercent: number | null;
  /** Most common unwanted-effect tags across the user's sessions. */
  topUnwantedEffects: { tag: string; count: number }[];
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

/** Admin dashboard — aggregate stats (no private grams/minutes). */
export interface AdminStats {
  users: {
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
  };
  sessions: {
    total: number;
    public: number;
    private: number;
    today: number;
    last7Days: number;
    last30Days: number;
  };
  activeUsers: {
    last7Days: number;
    last30Days: number;
  };
  averages: {
    sessionsPerUser: number;
    averageRating: number;
  };
  topStrains: { slug: string; count: number }[];
  topDevices: { slug: string; name: string; category: string; count: number }[];
  topMoods: { tag: string; count: number }[];
  topUnwantedEffects: { tag: string; count: number }[];
  dailySeries: { day: string; sessions: number; publicSessions: number }[];
}

/** Admin dashboard user list item (aggregate counts only). */
export interface AdminUser {
  id: string;
  handle: string;
  role: string;
  createdAt: string;
  sessionCount: number;
  lastSessionAt: string | null;
}

/** Admin dashboard system health snapshot. */
export interface AdminSystem {
  db: "up" | "down";
  migrations: string[];
  activeTokens: number;
  deviceCount: number;
  deviceReviewCount: number;
}

/** Paginated response from GET /api/admin/users. */
export interface AdminUsersResponse {
  users: AdminUser[];
  pagination: {
    limit: number;
    offset: number;
    returned: number;
  };
}

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
