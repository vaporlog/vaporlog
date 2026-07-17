/**
 * vaporlog — auth core (Supabase Auth).
 *
 * Accounts live in Supabase: one `auth.users` row per account plus a
 * `public.profiles` row (handle + birthdate) created by the
 * `on_auth_user_created` database trigger (see supabase/schema.sql).
 *
 * Handle-based sign-in over Supabase email auth: the app never collects a
 * real email — the handle is mapped to a synthetic address
 * (`<handle>@vaporlog.app`) and that is what Supabase authenticates.
 * Handles are unique case-insensitively (unique index on lower(handle)).
 *
 * Synchronous reads: `getCurrentAccount()` stays sync, backed by an
 * in-memory cache that is hydrated at module init via
 * `supabase.auth.getSession()` and kept fresh via
 * `supabase.auth.onAuthStateChange`. Identity fields come from
 * `user_metadata` immediately and are then corrected from the `profiles`
 * table in the background (the table is the source of truth).
 *
 * The public API of this module is a contract — other layers (data.ts,
 * AppLayout, the welcome flow) code against it and must not need changes.
 */
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { validateUsername } from "@/lib/profile-flow";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * The public account shape — what every consumer is allowed to see.
 * `id` is the Supabase auth user uuid.
 */
export interface Account {
  id: string;
  /** The user's handle (pseudonym) — stored lowercase in `profiles`. */
  username: string;
  /** ISO date (YYYY-MM-DD) — collected at the 21+ age gate. */
  birthdate: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface SignUpInput {
  username: string;
  password: string;
  /** ISO date (YYYY-MM-DD) — from the age-gate step. */
  birthdate: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Minimum password length (local MVP — no confirmation field). */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Single error for unknown handle AND wrong password — never reveal which
 * one failed. (Supabase likewise returns one "invalid credentials" error
 * for both, so this stays enforceable.)
 */
const GENERIC_CREDENTIAL_ERROR = "Incorrect username or password.";
const HANDLE_TAKEN_ERROR = "That handle is taken.";

/** Domain used to turn handles into synthetic Supabase auth emails. */
const SYNTHETIC_EMAIL_DOMAIN = "vaporlog.app";

/* ------------------------------------------------------------------ */
/* Handle ↔ synthetic email                                            */
/* ------------------------------------------------------------------ */

/**
 * Maps a handle to the synthetic email Supabase actually authenticates.
 * Handles are validated as `[A-Za-z0-9-]+` (see profile-flow.ts), so the
 * result is always a RFC-safe mailbox. Always lowercase — handle
 * uniqueness is case-insensitive end to end.
 */
function syntheticEmail(handle: string): string {
  return `${handle.toLowerCase().trim()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/* ------------------------------------------------------------------ */
/* In-memory session cache (keeps getCurrentAccount synchronous)       */
/* ------------------------------------------------------------------ */

let accountCache: Account | null = null;

/** Builds the public Account from a Supabase auth user (metadata first). */
function accountFromUser(user: User): Account {
  const metadata = user.user_metadata as Record<string, unknown>;
  const metaHandle =
    typeof metadata.handle === "string" ? metadata.handle : undefined;
  const metaBirthdate =
    typeof metadata.birthdate === "string" ? metadata.birthdate : undefined;
  return {
    id: user.id,
    // Fallback: the local part of the synthetic email IS the handle.
    username: metaHandle ?? user.email?.split("@")[0] ?? "",
    birthdate: metaBirthdate ?? "",
    createdAt: user.created_at,
  };
}

/**
 * Replaces the cache and notifies listeners only when something actually
 * changed (onAuthStateChange also fires on token refreshes — those should
 * not re-render the app).
 */
function setCache(next: Account | null): void {
  const prev = accountCache;
  const changed =
    (prev === null) !== (next === null) ||
    (prev !== null &&
      next !== null &&
      (prev.id !== next.id ||
        prev.username !== next.username ||
        prev.birthdate !== next.birthdate ||
        prev.createdAt !== next.createdAt));
  accountCache = next;
  if (changed) notifyAuthChanged();
}

/**
 * Corrects the cache from the `profiles` table (the source of truth for
 * handle/birthdate) in the background. Runs after every cache write; the
 * sync getter never waits for it.
 */
async function hydrateFromProfile(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("handle, birthdate, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return;
    // The user may have signed out / switched accounts while we waited.
    if (accountCache?.id !== userId) return;
    setCache({
      id: userId,
      username: data.handle ?? accountCache.username,
      birthdate: data.birthdate ?? accountCache.birthdate,
      createdAt: data.created_at ?? accountCache.createdAt,
    });
  } catch {
    /* offline / RLS hiccup — metadata-derived cache stays, never fatal */
  }
}

function applySession(session: Session | null): void {
  const user = session?.user ?? null;
  if (!user) {
    setCache(null);
    return;
  }
  setCache(accountFromUser(user));
  void hydrateFromProfile(user.id);
}

/*
 * Auth-readiness gate. The initial getSession() restore is async, so a
 * signed-in user's first synchronous getCurrentAccount() read is null —
 * without a gate, route guards briefly bounce them to /welcome before the
 * session lands. whenAuthReady() lets the app shell hold first render
 * until the restore settles (success OR failure — it must never hang).
 */
let resolveAuthReady!: () => void;
const authReady = new Promise<void>((resolve) => {
  resolveAuthReady = resolve;
});

/** Resolves once the initial persisted-session restore has settled. */
export function whenAuthReady(): Promise<void> {
  return authReady;
}

/* Hydrate the cache once at module load (restores a persisted session). */
void supabase.auth
  .getSession()
  .then(({ data }) => {
    applySession(data.session);
  })
  .catch(() => {
    /* offline — stay signed out locally; never block first render */
  })
  .finally(() => {
    resolveAuthReady();
  });

/* Keep the cache fresh for the lifetime of the page. */
supabase.auth.onAuthStateChange((_event, session) => {
  applySession(session);
});

/* ------------------------------------------------------------------ */
/* Auth-change notification (lets the app shell react to sign-in/out)  */
/* ------------------------------------------------------------------ */

const AUTH_CHANGED_EVENT = "vaporlog:auth-changed";

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/**
 * Subscribes to sign-in / sign-out events. Returns an unsubscribe
 * function — pair it with `useEffect` cleanup.
 */
export function onAuthChange(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

/* ------------------------------------------------------------------ */
/* Error mapping                                                       */
/* ------------------------------------------------------------------ */

/**
 * Maps a signUp failure to a user-facing message.
 *
 * Handle collisions surface two ways:
 *   1. The deterministic pre-check in `signUp` (SELECT on profiles).
 *   2. A race against the case-insensitive unique index — the trigger
 *      raises and Supabase reports a database/unique error (GoTrue
 *      sanitizes trigger exceptions to "Database error saving new user",
 *      so matching is deliberately broad). The pre-check makes this path
 *      vanishingly rare; the mapping keeps it user-friendly.
 * Everything else passes Supabase's message through (those are written
 * for end users: weak password, rate limit, …) with a neutral fallback.
 */
function mapSignUpError(error: AuthError): Error {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (
    text.includes("already") ||
    text.includes("duplicate") ||
    text.includes("unique") ||
    text.includes("database error")
  ) {
    return new Error(HANDLE_TAKEN_ERROR);
  }
  if (text.includes("password")) {
    return new Error(
      `Passwords are at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  return new Error(error.message || "Sign-up failed — please try again.");
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * The signed-in account, or `null`. SYNCHRONOUS — reads the in-memory
 * cache hydrated at module init and maintained via onAuthStateChange.
 * Never throws.
 */
export function getCurrentAccount(): Account | null {
  return accountCache;
}

/**
 * Creates an account and signs in. Rejects (throws Error) with a
 * human-readable message when:
 *   - the username fails validation or is taken (case-insensitive),
 *   - the password is shorter than PASSWORD_MIN_LENGTH,
 *   - the birthdate is not an ISO date (21+ gate ran upstream).
 *
 * The DB trigger on auth.users creates the matching `profiles` row from
 * the metadata passed here. When the Supabase project has email
 * confirmation enabled, signUp returns no session — in that case we fall
 * back to one direct password sign-in.
 */
export async function signUp(input: SignUpInput): Promise<Account> {
  const username = input.username.trim();
  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) {
    throw new Error(usernameCheck.error ?? "Enter a username.");
  }
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Passwords are at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthdate)) {
    throw new Error("A valid birthdate is required.");
  }

  const handle = username.toLowerCase();
  const email = syntheticEmail(handle);

  // Deterministic taken-handle check (profiles are world-readable per
  // RLS). The unique index on lower(handle) remains the real guard.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .maybeSingle();
  if (existing) {
    throw new Error(HANDLE_TAKEN_ERROR);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { handle, birthdate: input.birthdate } },
  });
  if (error) {
    throw mapSignUpError(error);
  }

  let session = data.session;
  let user = data.user;

  // Email-confirmation configs return no session — try signing in once.
  if (!session) {
    const { data: fallback, error: fallbackError } =
      await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });
    if (fallbackError || !fallback.session) {
      throw new Error(
        "Account created — please confirm it, then sign in.",
      );
    }
    session = fallback.session;
    user = fallback.user;
  }

  if (!user) {
    throw new Error("Sign-up failed — please try again.");
  }

  const account = accountFromUser(user);
  setCache(account);
  void hydrateFromProfile(user.id);
  return account;
}

/**
 * Signs in with handle + password. Rejects with a single generic message
 * for both unknown handles and wrong passwords — never reveal which one
 * failed.
 */
export async function signIn(
  username: string,
  password: string,
): Promise<Account> {
  const email = syntheticEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) {
    throw new Error(GENERIC_CREDENTIAL_ERROR);
  }
  const account = accountFromUser(data.user);
  setCache(account);
  void hydrateFromProfile(data.user.id);
  return account;
}

/**
 * Signs out the current account (no-op when already signed out). Clears
 * the local cache synchronously so the UI reacts immediately; the remote
 * Supabase sign-out (which also fires onAuthStateChange) is best-effort.
 */
export function signOut(): void {
  setCache(null);
  void supabase.auth.signOut().catch(() => {
    /* network hiccup — local sign-out already happened, never fatal */
  });
}
