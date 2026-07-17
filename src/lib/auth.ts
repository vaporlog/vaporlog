/**
 * vaporlog — local account system (auth core).
 *
 * Accounts are stored locally but shaped exactly like the future Supabase
 * implementation (spec decision 10): an accounts table, a session record,
 * salted password hashes, and a public `Account` type that never exposes
 * credentials. Swapping this module for Supabase Auth later should not
 * change any call site.
 *
 * Storage:
 *   - localStorage["vaporlog.accounts"]  StoredAccount[] (incl. passHash+salt)
 *   - localStorage["vaporlog.session"]   { accountId } — the signed-in account
 *
 * Passwords are NEVER stored in plaintext: SHA-256 over `<salt>:<password>`
 * via Web Crypto (`crypto.subtle`), with a per-user random 16-byte salt.
 * `crypto.subtle` requires a secure context — localhost qualifies.
 *
 * Migration: the first successful `signUp` moves the pre-auth local-first
 * data (`vaporlog.sessions`, `vaporlog.mystrains`, `vaporlog.mydevices`)
 * into the new account's namespace and removes the legacy keys. The legacy
 * `vaporlog.profile` is absorbed by the account row itself (username +
 * birthdate + createdAt) and removed as well.
 */
import { validateUsername } from "@/lib/profile-flow";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * The public account shape — what every consumer is allowed to see.
 * Deliberately excludes `passHash` and `salt`.
 */
export interface Account {
  id: string;
  username: string;
  /** ISO date (YYYY-MM-DD) — collected at the 21+ age gate. */
  birthdate: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** The persisted account row: the public shape plus credentials. */
interface StoredAccount extends Account {
  /** Hex-encoded SHA-256 of `<salt>:<password>`. */
  passHash: string;
  /** Hex-encoded random 16-byte salt. */
  salt: string;
}

/** Shape of localStorage["vaporlog.session"]. */
interface SessionRecord {
  accountId: string;
}

export interface SignUpInput {
  username: string;
  password: string;
  /** ISO date (YYYY-MM-DD) — from the age-gate step. */
  birthdate: string;
}

/* ------------------------------------------------------------------ */
/* Storage keys                                                        */
/* ------------------------------------------------------------------ */

/** localStorage key for the account table (StoredAccount[]). */
export const ACCOUNTS_STORAGE_KEY = "vaporlog.accounts";
/** localStorage key for the current session ({ accountId }). */
export const SESSION_STORAGE_KEY = "vaporlog.session";

/**
 * Legacy pre-auth keys, known here ONLY for one-time migration into the
 * first account's namespace. data.ts / personal.ts own the live keys.
 */
const LEGACY_SESSIONS_KEY = "vaporlog.sessions";
const LEGACY_MY_STRAINS_KEY = "vaporlog.mystrains";
const LEGACY_MY_DEVICES_KEY = "vaporlog.mydevices";
const LEGACY_PROFILE_KEY = "vaporlog.profile";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Minimum password length (local MVP — no confirmation field). */
export const PASSWORD_MIN_LENGTH = 6;

const SALT_BYTES = 16;
const GENERIC_CREDENTIAL_ERROR = "Incorrect username or password.";

/* ------------------------------------------------------------------ */
/* Web Crypto helpers                                                  */
/* ------------------------------------------------------------------ */

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function randomSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** SHA-256 hex digest of `<salt>:<password>`. Never logs or stores input. */
async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Secure password hashing is unavailable — vaporlog needs a secure (localhost or HTTPS) context.",
    );
  }
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/* ------------------------------------------------------------------ */
/* Storage helpers (never throw — corrupt data reads as empty)         */
/* ------------------------------------------------------------------ */

function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAccount);
  } catch {
    return [];
  }
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.username === "string" &&
    typeof v.birthdate === "string" &&
    typeof v.passHash === "string" &&
    typeof v.salt === "string" &&
    typeof v.createdAt === "string"
  );
}

function writeAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function readSession(): SessionRecord | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const accountId = (parsed as Record<string, unknown>).accountId;
    return typeof accountId === "string" ? { accountId } : null;
  } catch {
    return null;
  }
}

function writeSession(record: SessionRecord): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
}

/** Strips credentials — the only way an account leaves this module. */
function toAccount(stored: StoredAccount): Account {
  return {
    id: stored.id,
    username: stored.username,
    birthdate: stored.birthdate,
    createdAt: stored.createdAt,
  };
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
/* Legacy data migration (first signUp adopts pre-auth local data)     */
/* ------------------------------------------------------------------ */

function migrateLegacyKey(legacyKey: string, accountKey: string): void {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return;
    // Never overwrite data the account may already have.
    if (localStorage.getItem(accountKey) === null) {
      localStorage.setItem(accountKey, raw);
    }
    localStorage.removeItem(legacyKey);
  } catch {
    /* storage unavailable — migration is best-effort, data stays put */
  }
}

/**
 * Moves pre-auth local-first data into `accountId`'s namespace and removes
 * the legacy keys. Runs on the first successful signUp (the only moment
 * legacy data can belong to a brand-new account). The legacy profile has no
 * namespace to move into — the account row IS its new home (username,
 * birthdate, createdAt) — so it is simply removed once the account exists.
 */
function migrateLegacyData(accountId: string): void {
  migrateLegacyKey(LEGACY_SESSIONS_KEY, `vaporlog.sessions.${accountId}`);
  migrateLegacyKey(LEGACY_MY_STRAINS_KEY, `vaporlog.mystrains.${accountId}`);
  migrateLegacyKey(LEGACY_MY_DEVICES_KEY, `vaporlog.mydevices.${accountId}`);
  try {
    localStorage.removeItem(LEGACY_PROFILE_KEY);
  } catch {
    /* storage unavailable — migration is best-effort, data stays put */
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Every account, public shape only (no credentials). Used by the data
 * layer to aggregate public sessions across accounts.
 */
export function listAccounts(): Account[] {
  return readAccounts().map(toAccount);
}

/**
 * The signed-in account, or `null`. Never throws; a dangling session
 * (account deleted) is cleaned up and reads as signed-out.
 */
export function getCurrentAccount(): Account | null {
  const session = readSession();
  if (!session) return null;
  const stored = readAccounts().find((a) => a.id === session.accountId);
  if (!stored) {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  return toAccount(stored);
}

/**
 * Creates an account and signs in. Rejects (throws Error) with a
 * human-readable message when:
 *   - the username is taken (case-insensitive),
 *   - the password is shorter than PASSWORD_MIN_LENGTH,
 *   - the username or birthdate fails validation (21+).
 * On the FIRST signUp, legacy pre-auth data is migrated into the new
 * account's namespace.
 */
export async function signUp(input: SignUpInput): Promise<Account> {
  const username = input.username.trim();
  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) {
    throw new Error(usernameCheck.error ?? "Enter a username.");
  }
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Passwords are at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthdate)) {
    throw new Error("A valid birthdate is required.");
  }

  const accounts = readAccounts();
  const taken = accounts.some(
    (a) => a.username.toLowerCase() === username.toLowerCase(),
  );
  if (taken) {
    throw new Error("That username is taken — try another one.");
  }

  const salt = randomSalt();
  const passHash = await hashPassword(input.password, salt);
  const stored: StoredAccount = {
    id: crypto.randomUUID(),
    username,
    birthdate: input.birthdate,
    passHash,
    salt,
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...accounts, stored]);
  migrateLegacyData(stored.id);
  writeSession({ accountId: stored.id });
  notifyAuthChanged();
  return toAccount(stored);
}

/**
 * Signs in with username + password. Rejects with a single generic
 * message for both unknown usernames and wrong passwords — never reveal
 * which one failed.
 */
export async function signIn(
  username: string,
  password: string,
): Promise<Account> {
  const name = username.trim().toLowerCase();
  const stored = readAccounts().find(
    (a) => a.username.toLowerCase() === name,
  );
  if (!stored) {
    throw new Error(GENERIC_CREDENTIAL_ERROR);
  }
  const passHash = await hashPassword(password, stored.salt);
  if (passHash !== stored.passHash) {
    throw new Error(GENERIC_CREDENTIAL_ERROR);
  }
  writeSession({ accountId: stored.id });
  notifyAuthChanged();
  return toAccount(stored);
}

/** Signs out the current account (no-op when already signed out). */
export function signOut(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifyAuthChanged();
}
