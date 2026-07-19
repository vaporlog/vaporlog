/**
 * vaporlog — REST client for the self-hosted API (single shared helper).
 *
 * The app talks to a small Node/Postgres backend (see server/): every
 * route lives under `/api`, JSON in and out, errors shaped `{ error }`.
 * In production nginx proxies same-origin `/api` to the API container;
 * in dev the Vite server proxies it to localhost:4000 (vite.config.ts).
 * A different origin can be set via VITE_API_URL.
 *
 * Auth is an opaque bearer token issued by POST /api/auth/signup|signin,
 * stored in localStorage["vaporlog.token"] and sent as
 * `Authorization: Bearer <token>` on every request marked `auth: true`.
 */

/** API base — same-origin `/api` unless VITE_API_URL overrides it. */
const API_BASE: string = import.meta.env.VITE_API_URL ?? "/api";

/** localStorage key for the opaque session token. */
const TOKEN_STORAGE_KEY = "vaporlog.token";

/** Message used when the API cannot be reached or answers unexpectedly. */
const NETWORK_ERROR_MESSAGE = "Network error — is the API up?";

/** Returns the stored session token, or `null` when signed out. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the session token (called on sign-up / sign-in). */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* storage unavailable — the session lives in memory only */
  }
}

/** Drops the stored session token (called on sign-out / revoked token). */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

export interface ApiFetchOptions {
  /** HTTP method — defaults to GET (or POST when a body is given). */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-serializable request body. */
  body?: unknown;
  /** Attach `Authorization: Bearer <token>` from storage. */
  auth?: boolean;
}

/**
 * One fetch wrapper for the whole app: JSON in/out, bearer auth, and a
 * single error convention. Every failure rejects with an Error whose
 * message is the server's `{ error }` text when present (those messages
 * are written for end users and pass straight through to the UI), or a
 * network fallback otherwise.
 *
 * HTTP failures also carry the status code on `error.status` so callers
 * can tell an expired token (401) apart from a network hiccup. Resolves
 * to the parsed body, or `undefined` for 204 No Content.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T | undefined> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth) {
    const token = getToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 204) return undefined;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* empty or non-JSON body — only the status matters from here */
  }

  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown } | null)?.error === "string"
        ? (payload as { error: string }).error
        : NETWORK_ERROR_MESSAGE;
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  return payload as T;
}
