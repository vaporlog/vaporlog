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
 *   - Personal diary entries:   the self-hosted API (GET/POST/PATCH/DELETE
 *                               /api/sessions*, Node + Postgres), mirrored
 *                               into in-memory caches so the sync getters
 *                               below keep working; reactive access via
 *                               useMySessions() / usePublicSessions().
 *                               Legacy localStorage keys
 *                               ("vaporlog.sessions[.<accountId>]") are read
 *                               exactly once per user and uploaded to the
 *                               cloud on first sign-in — see
 *                               migrateLegacySessions().
 *   - Accounts/session:         lib/auth.ts (token auth via lib/api.ts)
 *   - Legacy local profile:     localStorage["vaporlog.profile"]
 *
 * Privacy rule (spec decision 5): personal sessions are private by
 * default; only sessions flagged isPublic are visible to other users,
 * enforced server-side by the API (ownership checks + public-only
 * queries).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import seed from "@/data/seed.json";
import demoSessions from "@/data/demo-sessions.json";
import vocab from "@/data/vocab.json";
import { getCurrentAccount, onAuthChange } from "@/lib/auth";
import type { Account } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
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
 * Legacy (pre-auth / pre-cloud) localStorage key for personal sessions.
 * No longer written — read exactly once per user by the legacy cloud
 * migration (see migrateLegacySessions), then removed.
 */
export const SESSIONS_STORAGE_KEY = "vaporlog.sessions";
/** localStorage key for the legacy local profile (Profile). */
export const PROFILE_STORAGE_KEY = "vaporlog.profile";

/**
 * Prefix of the legacy per-account session lists:
 * `vaporlog.sessions.<accountId>`. Migration source only.
 */
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
 * shows only sessions real users published.
 */
export function getCommunitySessions(): SessionLog[] {
  return COMMUNITY_SESSIONS;
}

/* ------------------------------------------------------------------ */
/* Session ordering                                                    */
/* ------------------------------------------------------------------ */

/**
 * The API speaks the SessionLog shape directly (camelCase both ways), so
 * no row mapping lives here anymore — the only client-side transform is
 * ordering: newest first, by createdAt.
 */

/** Newest-first comparator (createdAt desc) used for both caches. */
function newestFirst(a: SessionLog, b: SessionLog): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/* ------------------------------------------------------------------ */
/* In-memory session caches + external store                           */
/* ------------------------------------------------------------------ */

/**
 * Sessions live on the API; these module-level caches mirror them so the
 * synchronous getters (getMySessions / getAllPublicSessions /
 * getPublicSession) keep their pre-cloud signatures. Hydration triggers:
 *   - module boot:      public sessions are fetched (always, signed in
 *                       or not) and own sessions too when a session is
 *                       already restored;
 *   - auth change:      signing in hydrates own sessions (after the
 *                       legacy migration), signing out clears them.
 * React consumers should prefer useMySessions() / usePublicSessions(),
 * which re-render when the caches change.
 */
interface SessionsState {
  sessions: SessionLog[];
  loading: boolean;
}

/** Current account's sessions, newest first (empty when signed out). */
let mySessionsCache: SessionLog[] = [];
/** Cloud public sessions only (no demo merge), newest first. */
let publicCloudCache: SessionLog[] = [];
/** Demo sessions (dev-only) + publicCloudCache, newest first. */
let publicMergedCache: SessionLog[] = mergePublic(publicCloudCache);
/** False until the first public fetch settles (success or failure). */
let publicReady = false;

let myState: SessionsState = { sessions: mySessionsCache, loading: false };
let publicState: SessionsState = {
  sessions: publicMergedCache,
  loading: true,
};

const sessionListeners = new Set<() => void>();

function emitSessions(): void {
  for (const listener of sessionListeners) listener();
}

function subscribeSessions(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Merges the dev-only demo sessions with the cloud public sessions. */
function mergePublic(cloud: SessionLog[]): SessionLog[] {
  return [...COMMUNITY_SESSIONS, ...cloud].sort(newestFirst);
}

function setMyCache(sessions: SessionLog[], loading: boolean): void {
  mySessionsCache = sessions;
  myState = { sessions, loading };
  emitSessions();
}

function setPublicCloudCache(cloud: SessionLog[], ready: boolean): void {
  publicCloudCache = cloud;
  publicMergedCache = mergePublic(cloud);
  publicReady = ready;
  publicState = { sessions: publicMergedCache, loading: !ready };
  emitSessions();
}

/**
 * Point-in-time copy of every cache reference, for optimistic-mutation
 * rollback. Restoring re-establishes the exact previous array/state
 * identities so useSyncExternalStore snapshots stay consistent.
 */
interface CacheSnapshot {
  myCache: SessionLog[];
  myState: SessionsState;
  cloud: SessionLog[];
  merged: SessionLog[];
  publicState: SessionsState;
  publicReady: boolean;
}

function snapshotCaches(): CacheSnapshot {
  return {
    myCache: mySessionsCache,
    myState,
    cloud: publicCloudCache,
    merged: publicMergedCache,
    publicState,
    publicReady,
  };
}

function restoreCaches(snapshot: CacheSnapshot): void {
  mySessionsCache = snapshot.myCache;
  myState = snapshot.myState;
  publicCloudCache = snapshot.cloud;
  publicMergedCache = snapshot.merged;
  publicState = snapshot.publicState;
  publicReady = snapshot.publicReady;
  emitSessions();
}

/** Optimistically inserts/replaces one session in the public cache. */
function upsertPublicCache(session: SessionLog): void {
  const rest = publicCloudCache.filter((s) => s.id !== session.id);
  setPublicCloudCache([session, ...rest].sort(newestFirst), publicReady);
}

/* ------------------------------------------------------------------ */
/* Cloud hydration                                                     */
/* ------------------------------------------------------------------ */

/** Invalidates in-flight own-session fetches (bumped on sign-out). */
let myHydrateToken = 0;
/** Invalidates superseded public fetches. */
let publicFetchToken = 0;

/**
 * Fetches every session owned by the signed-in account (GET
 * /api/sessions/mine) into the personal cache. Runs the legacy
 * localStorage → cloud migration first so freshly uploaded rows are
 * included. Safe to call repeatedly; a stale response (sign-out or newer
 * hydration while in flight) is discarded.
 */
async function hydrateMySessions(account: Account): Promise<void> {
  const token = ++myHydrateToken;
  setMyCache(mySessionsCache, true);
  try {
    await migrateLegacySessions(account);
  } catch (error) {
    // Not fatal: the flag stays unset and the next sign-in retries.
    console.warn("vaporlog: legacy session migration failed; will retry on next sign-in.", error);
  }
  try {
    const data = await apiFetch<{ sessions: SessionLog[] }>(
      "/sessions/mine",
      { auth: true },
    );
    if (token !== myHydrateToken) return; // signed out / re-hydrated in flight
    setMyCache((data?.sessions ?? []).slice().sort(newestFirst), false);
  } catch (error) {
    if (token !== myHydrateToken) return;
    console.warn("vaporlog: could not load your sessions.", error);
    setMyCache([], false);
    return;
  }
  // The migration may have published rows — refresh the public feed.
  void refreshPublicSessions();
}

/** Fetches all public sessions (GET /api/sessions/public) into the cache. */
async function refreshPublicSessions(): Promise<void> {
  const token = ++publicFetchToken;
  try {
    const data = await apiFetch<{ sessions: SessionLog[] }>("/sessions/public");
    if (token !== publicFetchToken) return;
    setPublicCloudCache((data?.sessions ?? []).slice().sort(newestFirst), true);
  } catch (error) {
    if (token !== publicFetchToken) return;
    console.warn("vaporlog: could not load public sessions.", error);
    if (!publicReady) setPublicCloudCache(publicCloudCache, true);
  }
}

/* ------------------------------------------------------------------ */
/* Legacy localStorage → cloud migration                               */
/* ------------------------------------------------------------------ */

/**
 * Per-user localStorage flag marking a completed legacy migration:
 * `vaporlog.cloud-migrated.<userId>` === "1". Set only after every legacy
 * list uploaded successfully (or nothing was found), so a failed attempt
 * is retried on the next sign-in. Upserts on preserved ids make retries
 * idempotent.
 */
const MIGRATION_DONE_PREFIX = "vaporlog.cloud-migrated.";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a legacy session list from one localStorage key. Never throws. */
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

/** Every legacy session key: the anonymous key + all per-account keys. */
function legacySessionKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (
      key === SESSIONS_STORAGE_KEY ||
      (key !== null && key.startsWith(ACCOUNT_SESSIONS_PREFIX))
    ) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * One-time upload of pre-cloud localStorage sessions ("vaporlog.sessions"
 * and every "vaporlog.sessions.<oldAccountId>") into the signed-in user's
 * cloud account, preserving is_public flags and timestamps. Runs on the
 * first auth-change into a signed-in state; idempotent via the per-user
 * completion flag + upserts on preserved (uuid-shaped) ids. On success
 * the legacy keys are removed; on failure the flag stays unset so the
 * next sign-in retries. Throws when the upload fails.
 */
async function migrateLegacySessions(account: Account): Promise<void> {
  const flagKey = `${MIGRATION_DONE_PREFIX}${account.id}`;
  let alreadyDone = false;
  let keys: string[] = [];
  try {
    alreadyDone = localStorage.getItem(flagKey) === "1";
    if (!alreadyDone) keys = legacySessionKeys();
  } catch {
    return; // storage unavailable — nothing we can do from here
  }
  if (alreadyDone) return;

  // Dedupe by id (the same entry should never sit under two legacy keys,
  // but the old signUp migration left room for it on shared devices).
  const byId = new Map<string, SessionLog>();
  for (const key of keys) {
    for (const session of readSessionsAt(key)) {
      if (typeof session?.id === "string" && !byId.has(session.id)) {
        byId.set(session.id, session);
      }
    }
  }

  if (byId.size > 0) {
    // Upload through the same POST /api/sessions upsert path as regular
    // saves, preserving ids + createdAt (the server PK is a uuid —
    // regenerate ids that are not). Sequential on purpose: any failure
    // throws, the completion flag stays unset, and the next sign-in
    // retries (upserts on preserved ids keep retries idempotent).
    for (const session of byId.values()) {
      const upload = UUID_RE.test(session.id)
        ? session
        : { ...session, id: crypto.randomUUID() };
      await apiFetch("/sessions", {
        method: "POST",
        body: upload,
        auth: true,
      });
    }
  }

  try {
    for (const key of keys) localStorage.removeItem(key);
    localStorage.setItem(flagKey, "1");
  } catch {
    /* storage unavailable — rows are uploaded; flag retries are harmless */
  }
}

/* ------------------------------------------------------------------ */
/* Personal sessions (current account)                                 */
/* ------------------------------------------------------------------ */

/**
 * Returns the current account's personal sessions, newest first, from the
 * in-memory cache. Returns `[]` while signed out; may return `[]` while
 * the first cloud fetch is in flight — reactive consumers should use
 * useMySessions() for its loading flag.
 */
export function getMySessions(): SessionLog[] {
  return mySessionsCache;
}

/**
 * Saves a session to the cloud and returns the stored copy. If `log.id`
 * is empty a UUID is generated; if `log.createdAt` is empty the current
 * time is used; if `log.author` is empty the current account's username
 * is stamped. The cache is updated OPTIMISTICALLY (upsert semantics: an
 * existing id is replaced, a new one prepended); on a failed cloud write
 * the cache is rolled back and the error rethrown. Rejects when signed
 * out — sessions require an account.
 */
export async function saveSession(log: SessionLog): Promise<SessionLog> {
  const account = getCurrentAccount();
  if (!account) {
    throw new Error("Sign in to save sessions.");
  }
  const stored: SessionLog = {
    ...log,
    id: log.id || crypto.randomUUID(),
    createdAt: log.createdAt || new Date().toISOString(),
    author: log.author || account.username,
  };
  const snapshot = snapshotCaches();
  setMyCache(
    [stored, ...mySessionsCache.filter((s) => s.id !== stored.id)].sort(
      newestFirst,
    ),
    myState.loading,
  );
  if (stored.isPublic) upsertPublicCache(stored);
  try {
    await apiFetch<{ session: SessionLog }>("/sessions", {
      method: "POST",
      body: stored,
      auth: true,
    });
  } catch (error) {
    restoreCaches(snapshot);
    throw error;
  }
  return stored;
}

/**
 * Deletes one of the current account's own sessions (optimistic, with
 * rollback + rethrow on failure). Rejects when signed out.
 */
export async function deleteSession(id: string): Promise<void> {
  const account = getCurrentAccount();
  if (!account) {
    throw new Error("Sign in to delete sessions.");
  }
  const snapshot = snapshotCaches();
  setMyCache(
    mySessionsCache.filter((s) => s.id !== id),
    myState.loading,
  );
  setPublicCloudCache(
    publicCloudCache.filter((s) => s.id !== id),
    publicReady,
  );
  try {
    await apiFetch(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      auth: true,
    });
  } catch (error) {
    restoreCaches(snapshot);
    throw error;
  }
}

/**
 * Flips `isPublic` on one of the current account's own sessions
 * (optimistic, with rollback + rethrow on failure). Returns the updated
 * session, or `undefined` when the id does not belong to a personal
 * session. Rejects when signed out.
 */
export async function toggleSessionPublic(
  id: string,
): Promise<SessionLog | undefined> {
  const account = getCurrentAccount();
  if (!account) {
    throw new Error("Sign in to publish sessions.");
  }
  const existing = mySessionsCache.find((s) => s.id === id);
  if (!existing) return undefined;
  const updated: SessionLog = { ...existing, isPublic: !existing.isPublic };
  const snapshot = snapshotCaches();
  setMyCache(
    mySessionsCache.map((s) => (s.id === id ? updated : s)),
    myState.loading,
  );
  if (updated.isPublic) {
    upsertPublicCache(updated);
  } else {
    setPublicCloudCache(
      publicCloudCache.filter((s) => s.id !== id),
      publicReady,
    );
  }
  try {
    await apiFetch<{ session: SessionLog }>(
      `/sessions/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: { isPublic: updated.isPublic },
        auth: true,
      },
    );
  } catch (error) {
    restoreCaches(snapshot);
    throw error;
  }
  return updated;
}

/* ------------------------------------------------------------------ */
/* Public sessions (cross-account)                                     */
/* ------------------------------------------------------------------ */

/**
 * Every public session: the demo community sessions (dev-only, empty in
 * production) plus every cloud session published by any user, newest
 * first (createdAt desc), from the in-memory cache. May be just the demo
 * sessions while the first cloud fetch is in flight — reactive consumers
 * should use usePublicSessions() for its loading flag.
 * This is the source for the community feed (/feed).
 */
export function getAllPublicSessions(): SessionLog[] {
  return publicMergedCache;
}

/**
 * Resolves a public session by id: community sessions first, then the
 * cached public cloud sessions. Returns `undefined` for private or
 * unknown ids — use this for the public session card page (/s/:id) so
 * private entries are never exposed. NOTE: the cloud cache hydrates
 * asynchronously after module boot, so a direct navigation may briefly
 * resolve nothing; usePublicSessions() exposes the loading state.
 */
export function getPublicSession(id: string): SessionLog | undefined {
  const community = COMMUNITY_SESSIONS.find((s) => s.id === id);
  if (community) return community;
  return publicCloudCache.find((s) => s.id === id && s.isPublic);
}

/* ------------------------------------------------------------------ */
/* Reactive hooks (useSyncExternalStore over the caches)               */
/* ------------------------------------------------------------------ */

/**
 * The current account's sessions straight from the cloud-backed cache:
 * `{ sessions, loading }`. `loading` is true while the first fetch for
 * the signed-in user (including the legacy migration) is in flight, and
 * false while signed out (sessions is then empty).
 */
export function useMySessions(): {
  sessions: SessionLog[];
  loading: boolean;
} {
  return useSyncExternalStore(subscribeSessions, () => myState);
}

/**
 * The public feed straight from the cloud-backed cache (dev-only demo
 * sessions merged in): `{ sessions, loading }`. `loading` is true until
 * the first public fetch settles.
 */
export function usePublicSessions(): {
  sessions: SessionLog[];
  loading: boolean;
} {
  return useSyncExternalStore(subscribeSessions, () => publicState);
}

/* ------------------------------------------------------------------ */
/* Hydration triggers (module boot + auth change)                      */
/* ------------------------------------------------------------------ */

// Public sessions hydrate at boot, signed in or not.
void refreshPublicSessions();

// Own sessions follow the auth state: hydrate on sign-in, clear on
// sign-out. The boot check covers a synchronously restored session; the
// listener covers everything after (including async session restore).
onAuthChange(() => {
  const account = getCurrentAccount();
  if (account) {
    void hydrateMySessions(account);
  } else {
    myHydrateToken += 1; // discard any in-flight fetch
    setMyCache([], false);
  }
});
const bootAccount = getCurrentAccount();
if (bootAccount) void hydrateMySessions(bootAccount);

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
