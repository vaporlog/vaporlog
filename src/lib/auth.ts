/**
 * vaporlog — auth core (self-hosted API + opaque bearer tokens).
 *
 * Accounts live on the self-hosted Node/Postgres backend (see server/):
 * one row per account (handle + password hash + birthdate) and one
 * `auth_tokens` row per session token. Handles are unique
 * case-insensitively and stored lowercase.
 *
 * The client holds an opaque token (localStorage["vaporlog.token"], see
 * lib/api.ts) and sends it as `Authorization: Bearer <token>`.
 *
 * Synchronous reads: `getCurrentAccount()` stays sync, backed by an
 * in-memory cache hydrated at module init from GET /api/auth/me (when a
 * persisted token exists) and maintained by signUp/signIn/signOut.
 *
 * The public API of this module is a contract — other layers (data.ts,
 * AppLayout, the welcome flow) code against it and must not need changes.
 */
import { apiFetch, clearToken, getToken, setToken } from "@/lib/api";
import { validateUsername } from "@/lib/profile-flow";
// personal.ts imports getCurrentAccount from this module; this import only
// reads top-level string constants (inside signUp), so the cycle is inert.
import {
  MY_DEVICES_KEY,
  MY_STRAINS_KEY,
  MY_VOCAB_KEY,
} from "@/components/log/personal";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * The public account shape — what every consumer is allowed to see.
 * `id` is the server-side user uuid.
 */
export interface Account {
  id: string;
  /** The user's handle (pseudonym) — stored lowercase on the server. */
  username: string;
  /** ISO date (YYYY-MM-DD) — collected at the 21+ age gate. */
  birthdate: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Server role: 'user', 'admin', or 'moderator'. */
  role: string;
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

/** Response shape of POST /api/auth/signup and /api/auth/signin. */
interface AuthResponse {
  token: string;
  account: Account;
}

/* ------------------------------------------------------------------ */
/* In-memory session cache (keeps getCurrentAccount synchronous)       */
/* ------------------------------------------------------------------ */

let accountCache: Account | null = null;

/**
 * Replaces the cache and notifies listeners only when something actually
 * changed (a no-op write must not re-render the app).
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
        prev.createdAt !== next.createdAt ||
        prev.role !== next.role));
  accountCache = next;
  if (changed) notifyAuthChanged();
}

/*
 * Auth-readiness gate. The initial /api/auth/me restore is async, so a
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

/*
 * Hydrate the cache once at module load (restores a persisted session).
 * Every path resolves the readiness gate:
 *   - no token:            signed out, resolve immediately;
 *   - 401:                 token is dead — clear it, stay signed out;
 *   - network/other error: keep the token (next reload retries), stay
 *                          signed out locally, still resolve.
 */
const bootToken = getToken();
if (bootToken === null) {
  resolveAuthReady();
} else {
  void apiFetch<{ account: Account }>("/auth/me", { auth: true })
    .then((data) => {
      if (data?.account) setCache(data.account);
    })
    .catch((error: unknown) => {
      if ((error as { status?: number }).status === 401) {
        clearToken();
      }
    })
    .finally(() => {
      resolveAuthReady();
    });
}

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
/* Legacy localStorage migration (anonymous personal data → account)   */
/* ------------------------------------------------------------------ */

/**
 * Moves the anonymous (pre-auth) personal keys — "vaporlog.mystrains",
 * "vaporlog.mydevices", "vaporlog.myvocab" — under the freshly created
 * account's id, so anything logged before sign-up follows the user into
 * their account. Best-effort: a storage failure must never break sign-up.
 */
function migrateAnonymousPersonalKeys(accountId: string): void {
  try {
    for (const baseKey of [MY_STRAINS_KEY, MY_DEVICES_KEY, MY_VOCAB_KEY]) {
      const legacy = localStorage.getItem(baseKey);
      if (legacy === null) continue;
      const accountKey = `${baseKey}.${accountId}`;
      // Never clobber data already stored under the account (impossible for
      // a brand-new uuid, but cheap to guarantee).
      if (localStorage.getItem(accountKey) === null) {
        localStorage.setItem(accountKey, legacy);
      }
      localStorage.removeItem(baseKey);
    }
  } catch {
    /* storage unavailable — the anonymous data stays put, sign-up proceeds */
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * The signed-in account, or `null`. SYNCHRONOUS — reads the in-memory
 * cache hydrated at module init and maintained by signUp/signIn/signOut.
 * Never throws.
 */
export function getCurrentAccount(): Account | null {
  return accountCache;
}

/**
 * Creates an account and signs in. Rejects (throws Error) with a
 * human-readable message when:
 *   - the username fails validation (client-side),
 *   - the password is shorter than PASSWORD_MIN_LENGTH (client-side),
 *   - the birthdate is not an ISO date (21+ gate ran upstream),
 *   - the handle is taken — the server's "That handle is taken." passes
 *     through verbatim.
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

  const data = await apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: {
      handle: username.toLowerCase(),
      password: input.password,
      birthdate: input.birthdate,
    },
  });
  if (!data?.token || !data.account) {
    throw new Error("Sign-up failed — please try again.");
  }
  // Token first: the auth-change notification triggered by setCache makes
  // data.ts hydrate the account's sessions, and that fetch needs the
  // token to already be in storage. The legacy-key migration runs before
  // both: after setCache, personal.ts reads the per-account keys, so the
  // anonymous data must already be there.
  migrateAnonymousPersonalKeys(data.account.id);
  setToken(data.token);
  setCache(data.account);
  return data.account;
}

/**
 * Signs in with handle + password. The server answers unknown handles and
 * wrong passwords with one generic 401 ("Incorrect handle or password.")
 * — it passes through verbatim so we never reveal which one failed.
 */
export async function signIn(
  username: string,
  password: string,
): Promise<Account> {
  const data = await apiFetch<AuthResponse>("/auth/signin", {
    method: "POST",
    body: { handle: username.toLowerCase().trim(), password },
  });
  if (!data?.token || !data.account) {
    throw new Error("Sign-in failed — please try again.");
  }
  setToken(data.token);
  setCache(data.account);
  return data.account;
}

/**
 * Signs out the current account (no-op when already signed out). Clears
 * the local cache + token synchronously so the UI reacts immediately; the
 * server-side token revocation is fire-and-forget (a stranded token
 * simply expires).
 */
export function signOut(): void {
  if (getToken() !== null) {
    // apiFetch reads the token synchronously at call time, so the request
    // still carries it even though local state is cleared right after.
    void apiFetch("/auth/signout", { method: "POST", auth: true }).catch(
      () => {
        /* network hiccup — local sign-out already happened, never fatal */
      },
    );
  }
  clearToken();
  setCache(null);
}
