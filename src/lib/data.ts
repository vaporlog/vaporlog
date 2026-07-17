/**
 * vaporlog — typed data-access module.
 *
 * ⚠️ API STABILITY: other agents consume this module. DO NOT change
 * function names, signatures, return types, or storage keys without
 * coordinating with every consumer. Add new functions freely; never
 * mutate the contract of the ones below.
 *
 * Sources:
 *   - Strain catalog:           src/data/strains.json (LAZY dynamic import —
 *                               ~8.6k records, several MB; Vite splits it into
 *                               its own chunk so it never lands in entry JS.
 *                               See the "Lazy strain catalog" section below.)
 *   - Devices:                  src/data/seed.json (static import)
 *   - Demo community sessions:  src/data/demo-sessions.json (static import,
 *                               DEV-ONLY — gated behind import.meta.env.DEV so
 *                               Rollup tree-shakes the whole JSON module out
 *                               of production builds; see COMMUNITY_SESSIONS)
 *   - Controlled vocabularies:  src/data/vocab.json (static import)
 *   - Personal diary entries:   localStorage["vaporlog.sessions.<accountId>"]
 *                               (per-account; legacy "vaporlog.sessions" is
 *                               the anonymous fallback and is migrated into
 *                               the first account at signUp — see lib/auth.ts)
 *   - Accounts/session:         lib/auth.ts (localStorage["vaporlog.accounts"])
 *   - Legacy local profile:     localStorage["vaporlog.profile"]
 *
 * Privacy rule (spec decision 5): personal sessions are private by
 * default and never leave the device in this MVP.
 */
import { useEffect, useState } from "react";
import seed from "@/data/seed.json";
import demoSessions from "@/data/demo-sessions.json";
import vocab from "@/data/vocab.json";
import { getCurrentAccount, listAccounts } from "@/lib/auth";
import type {
  DemoSessionsData,
  Device,
  Profile,
  SeedData,
  SessionLog,
  Strain,
  Vocab,
} from "@/lib/types";

/**
 * Legacy (pre-auth) localStorage key for personal sessions. Still the
 * fallback when nobody is signed in, and the source migrated into the
 * first account's namespace at signUp.
 */
export const SESSIONS_STORAGE_KEY = "vaporlog.sessions";
/** localStorage key for the legacy local profile (Profile). */
export const PROFILE_STORAGE_KEY = "vaporlog.profile";

/** Prefix for per-account session lists: `vaporlog.sessions.<accountId>`. */
const ACCOUNT_SESSIONS_PREFIX = `${SESSIONS_STORAGE_KEY}.`;

const seedData = seed as unknown as SeedData;
const vocabData = vocab as unknown as Vocab;
const demoData = demoSessions as unknown as DemoSessionsData;

/**
 * The 20 demo community sessions are a DEV-ONLY fixture. In production
 * builds Vite constant-folds `import.meta.env.DEV` to `false`, so this
 * binding becomes `[]`, the `demoSessions` import is left unreferenced,
 * and Rollup drops the entire demo-sessions.json module from the bundle.
 * Production therefore ships zero community sessions — an empty feed is
 * the normal production reality until real users publish sessions.
 * Do NOT "simplify" this ternary away.
 */
const COMMUNITY_SESSIONS: SessionLog[] = import.meta.env.DEV
  ? demoData.communitySessions
  : [];

/* ------------------------------------------------------------------ */
/* Lazy strain catalog                                                 */
/* ------------------------------------------------------------------ */

/**
 * The full strain catalog (~8.6k records, several MB of JSON in
 * src/data/strains.json) must NOT land in the entry JS chunk, so it is
 * loaded via dynamic import — Vite splits it into its own lazy chunk that
 * the browser fetches on first use and caches afterwards.
 *
 * Access model:
 *   - `loadStrains()`   — async. Fetches, merges, and caches the catalog.
 *                         Idempotent; safe to call from anywhere.
 *   - `useStrains()`    — React hook. Triggers the load and re-renders the
 *                         component when the catalog arrives. This is what
 *                         pages/components that need the FULL catalog
 *                         (search, scoring, pickers) should use.
 *   - `getStrains()`    — SYNC. Returns only what is already in memory:
 *                         the seed overrides before `loadStrains()` has
 *                         resolved, the full merged catalog afterwards.
 *                         Returns an EMPTY array until the catalog loads
 *                         (seed.json ships `strains: []`).
 *   - `getStrain(slug)` — SYNC. Same cache semantics; `undefined` until the
 *                         catalog loads (or when the slug is unknown).
 *
 * Display helpers that resolve a handful of slugs to names (feed, diary,
 * session card) keep working synchronously and fall back to a humanized
 * slug during the not-yet-loaded window; a `useStrains()` call high in the
 * tree re-renders them with real names once the catalog arrives.
 */

/** In-memory catalog (seed overrides merged in); `null` until first load. */
let catalogCache: Strain[] | null = null;
/** In-flight request, so concurrent callers share one fetch/parse. */
let catalogRequest: Promise<Strain[]> | null = null;

/**
 * Merges the lazy catalog with any seed strains. Seed strains win on slug
 * conflicts — they are the curated override channel (currently the seed
 * ships an empty `strains` array, so the catalog passes through untouched).
 */
function mergeCatalog(loaded: Strain[]): Strain[] {
  if (seedData.strains.length === 0) return loaded;
  const bySlug = new Map<string, Strain>();
  for (const strain of loaded) bySlug.set(strain.slug, strain);
  for (const strain of seedData.strains) bySlug.set(strain.slug, strain);
  return Array.from(bySlug.values());
}

/**
 * Loads the full strain catalog, fetching the lazy JSON chunk on first
 * call. Resolves to the cached catalog on every later call. A failed load
 * (e.g. offline) rejects and is NOT cached — the next call retries.
 */
export function loadStrains(): Promise<Strain[]> {
  if (catalogCache !== null) return Promise.resolve(catalogCache);
  if (catalogRequest === null) {
    catalogRequest = import("@/data/strains.json")
      .then((mod) => {
        const loaded = (mod as { default: unknown }).default as Strain[];
        catalogCache = mergeCatalog(loaded);
        return catalogCache;
      })
      .catch((error: unknown) => {
        catalogRequest = null; // allow a retry on the next call
        throw error;
      });
  }
  return catalogRequest;
}

/** True once the lazy catalog is in memory (getStrains() returns it all). */
export function areStrainsLoaded(): boolean {
  return catalogCache !== null;
}

/** Snapshot returned by {@link useStrains}. */
export interface StrainsCatalogState {
  /**
   * The merged catalog — EMPTY until the lazy chunk has loaded. Treat
   * `loading` as the signal, never array length.
   */
  strains: Strain[];
  /** True while the catalog chunk is being fetched/parsed (first load). */
  loading: boolean;
  /** True when the catalog chunk failed to load (strains stays empty). */
  error: boolean;
}

/**
 * React access to the lazy catalog: kicks off `loadStrains()` on mount
 * (no-op when already cached) and re-renders with the full catalog when it
 * arrives. Until then `strains` holds only the in-memory seed overrides
 * (normally empty) — render a loading state, not an empty state.
 */
export function useStrains(): StrainsCatalogState {
  const [state, setState] = useState<StrainsCatalogState>(() => ({
    strains: getStrains(),
    loading: catalogCache === null,
    error: false,
  }));

  useEffect(() => {
    if (catalogCache !== null) return; // already warm — nothing to do
    let cancelled = false;
    loadStrains()
      .then((strains) => {
        if (!cancelled) setState({ strains, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: true }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * SYNC strain access — returns only what is already in memory: the seed
 * overrides until `loadStrains()` resolves, then the full merged catalog.
 * Callers that need the FULL catalog must `await loadStrains()` first (or
 * use `useStrains()`); otherwise this returns an empty array.
 */
export function getStrains(): Strain[] {
  return catalogCache ?? seedData.strains;
}

/**
 * SYNC single-strain lookup over the in-memory cache. Returns `undefined`
 * when the slug is unknown OR when the lazy catalog has not loaded yet —
 * callers that must resolve a catalog slug should await `loadStrains()`
 * first (or use `useStrains()`).
 */
export function getStrain(slug: string): Strain | undefined {
  return (catalogCache ?? seedData.strains).find((s) => s.slug === slug);
}

/** Returns the full device catalog. */
export function getDevices(): Device[] {
  return seedData.devices;
}

/** Returns one device by slug, or `undefined` when not found. */
export function getDevice(slug: string): Device | undefined {
  return seedData.devices.find((d) => d.slug === slug);
}

/** Returns the controlled vocabularies (sorted unique, Title Case). */
export function getVocab(): Vocab {
  return vocabData;
}

/**
 * Returns the demo community sessions (read-only expert sessions from
 * vaporium). DEV-ONLY: returns `[]` in production builds, where the feed
 * shows only sessions real users published from this device.
 */
export function getCommunitySessions(): SessionLog[] {
  return COMMUNITY_SESSIONS;
}

/* ------------------------------------------------------------------ */
/* Session storage helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Storage key for the CURRENT account's session list. When nobody is
 * signed in this falls back to the legacy anonymous key so pre-auth
 * behavior (and any unguarded caller) keeps working exactly as before.
 */
function currentSessionsKey(): string {
  const account = getCurrentAccount();
  return account ? `${ACCOUNT_SESSIONS_PREFIX}${account.id}` : SESSIONS_STORAGE_KEY;
}

/** Reads a session list from one storage key. Never throws. */
function readSessionsAt(key: string): SessionLog[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * Every session stored by EVERY account (plus any legacy anonymous
 * sessions not yet migrated). Includes private sessions — callers must
 * filter `isPublic` when the data crosses an account boundary.
 */
function getAllStoredSessions(): SessionLog[] {
  const all: SessionLog[] = [];
  for (const account of listAccounts()) {
    all.push(...readSessionsAt(`${ACCOUNT_SESSIONS_PREFIX}${account.id}`));
  }
  // Legacy anonymous sessions (removed by signUp migration; only present
  // on devices that never created an account).
  all.push(...readSessionsAt(SESSIONS_STORAGE_KEY));
  return all;
}

/* ------------------------------------------------------------------ */
/* Personal sessions (current account)                                 */
/* ------------------------------------------------------------------ */

/**
 * Returns the current account's personal sessions, newest first.
 * Returns `[]` when nothing is stored or the stored value is unreadable —
 * never throws.
 */
export function getMySessions(): SessionLog[] {
  return readSessionsAt(currentSessionsKey());
}

/**
 * Prepends a session to the current account's personal list and returns
 * the stored copy. If `log.id` is empty a UUID is generated; if
 * `log.createdAt` is empty the current time is used; if `log.author` is
 * empty the current account's username is stamped (or "anonymous" when
 * nobody is signed in).
 */
export function saveSession(log: SessionLog): SessionLog {
  const stored: SessionLog = {
    ...log,
    id: log.id || crypto.randomUUID(),
    createdAt: log.createdAt || new Date().toISOString(),
    author: log.author || getCurrentAccount()?.username || "anonymous",
  };
  const sessions = [stored, ...getMySessions()];
  localStorage.setItem(currentSessionsKey(), JSON.stringify(sessions));
  return stored;
}

/**
 * Flips `isPublic` on one of the current account's own sessions and
 * persists the change. Returns the updated session, or `undefined` when
 * the id does not belong to a personal session.
 */
export function toggleSessionPublic(id: string): SessionLog | undefined {
  const sessions = getMySessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) return undefined;
  const updated: SessionLog = {
    ...sessions[index],
    isPublic: !sessions[index].isPublic,
  };
  sessions[index] = updated;
  localStorage.setItem(currentSessionsKey(), JSON.stringify(sessions));
  return updated;
}

/* ------------------------------------------------------------------ */
/* Public sessions (cross-account)                                     */
/* ------------------------------------------------------------------ */

/**
 * Every public session on the device: the demo community sessions
 * (dev-only, empty in production) plus the public sessions of EVERY
 * account, newest first (createdAt desc).
 * This is the source for the community feed (/feed).
 */
export function getAllPublicSessions(): SessionLog[] {
  const published = getAllStoredSessions().filter((s) => s.isPublic);
  return [...COMMUNITY_SESSIONS, ...published].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Resolves a public session by id: community sessions first, then every
 * account's sessions that were explicitly made public. Returns
 * `undefined` for private or unknown ids — use this for the public
 * session card page (/s/:id) so private entries are never exposed.
 */
export function getPublicSession(id: string): SessionLog | undefined {
  const community = COMMUNITY_SESSIONS.find((s) => s.id === id);
  if (community) return community;
  return getAllStoredSessions().find((s) => s.id === id && s.isPublic);
}

/* ------------------------------------------------------------------ */
/* Profile (legacy, account-derived)                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns the active local profile, or `null`. When an account is signed
 * in, the profile is derived from that account (username + birthdate);
 * otherwise the legacy pre-auth profile is read. Never throws on
 * unreadable data.
 */
export function getProfile(): Profile | null {
  const account = getCurrentAccount();
  if (account) {
    return {
      username: account.username,
      birthdate: account.birthdate,
      createdAt: account.createdAt,
    };
  }
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.birthdate !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    return {
      username: parsed.username,
      birthdate: parsed.birthdate,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/** Persists the legacy local profile (pre-auth /welcome age gate). */
export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
