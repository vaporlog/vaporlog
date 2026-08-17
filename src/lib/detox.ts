/**
 * vaporlog — detox streak ("días limpio").
 *
 * The user marks clean days on the diary calendar; the marks live on the
 * API (server/src/routes/detox.js) and are mirrored into a small external
 * store here so the diary card and the log form share one source. Streak
 * math is pure client-side: consecutive marked days ending today — or
 * yesterday, when today is still unmarked (the streak stays alive until
 * you log or the day ends).
 *
 * Tone contract (product decision): ending a streak is a WIN, never a
 * failure — a post-detox session is worth more, not less. Copy everywhere
 * follows that frame.
 *
 * Day keys are LOCAL calendar days ("YYYY-MM-DD") — the user's own day,
 * not UTC. Sessions also count: a day with a logged session is never
 * clean (the session always wins).
 */
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { getCurrentAccount, onAuthChange } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/* Day-key helpers (local calendar)                                    */
/* ------------------------------------------------------------------ */

/** Local "YYYY-MM-DD" for a Date (defaults to now). */
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The day key N days before a "YYYY-MM-DD" key. */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return localDayKey(date);
}

/* ------------------------------------------------------------------ */
/* Streak math (pure)                                                  */
/* ------------------------------------------------------------------ */

/**
 * The live streak: consecutive marked days ending today; when today is
 * unmarked but yesterday is marked, the streak counts from yesterday (it
 * stays alive until the day ends or a session lands). Zero when neither
 * is marked OR a session already happened today — logging ends the streak
 * immediately, even if the mark cleanup hasn't landed yet.
 */
export function currentStreak(
  markedDays: ReadonlySet<string>,
  hasSessionToday: boolean,
  today: string = localDayKey(),
): number {
  if (hasSessionToday) return 0;
  let cursor = markedDays.has(today)
    ? today
    : markedDays.has(shiftDayKey(today, -1))
      ? shiftDayKey(today, -1)
      : null;
  if (cursor === null) return 0;
  let streak = 0;
  while (cursor !== null && markedDays.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/* ------------------------------------------------------------------ */
/* Marks store (API mirror + optimistic toggles)                       */
/* ------------------------------------------------------------------ */

interface DetoxState {
  days: string[];
  /** False until the first fetch for the signed-in user settles. */
  loading: boolean;
}

let daysCache: string[] = [];
let state: DetoxState = { days: daysCache, loading: false };
let hydrateToken = 0;
/** Distinguishes "never fetched" from "fetched, genuinely empty". */
let fetchedOnce = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setDays(days: string[], loading: boolean): void {
  daysCache = days;
  state = { days, loading };
  emit();
}

/** Fetches the caller's marks. Stale responses (sign-out mid-flight) die. */
async function hydrate(): Promise<void> {
  const token = ++hydrateToken;
  fetchedOnce = true;
  if (!getCurrentAccount()) {
    setDays([], false);
    return;
  }
  setDays(daysCache, true);
  try {
    const data = await apiFetch<{ days: string[] }>("/detox/marks", {
      auth: true,
    });
    if (token !== hydrateToken) return;
    setDays(data?.days ?? [], false);
  } catch {
    if (token !== hydrateToken) return;
    setDays([], false);
  }
}

/** Marks a clean day (optimistic; server insert is idempotent). */
export async function markDay(day: string): Promise<void> {
  if (daysCache.includes(day)) return;
  setDays([day, ...daysCache].sort().reverse(), false);
  try {
    await apiFetch(`/detox/marks/${encodeURIComponent(day)}`, {
      method: "PUT",
      auth: true,
    });
  } catch {
    setDays(daysCache.filter((d) => d !== day), false);
  }
}

/** Unmarks a clean day (optimistic; 204 either way server-side). */
export async function unmarkDay(day: string): Promise<void> {
  if (!daysCache.includes(day)) return;
  setDays(daysCache.filter((d) => d !== day), false);
  try {
    await apiFetch(`/detox/marks/${encodeURIComponent(day)}`, {
      method: "DELETE",
      auth: true,
    });
  } catch {
    setDays([day, ...daysCache].sort().reverse(), false);
  }
}

/**
 * The caller's clean days as a Set plus the first-load flag. The store
 * hydrates at module boot (when a session exists) and on auth changes;
 * sign-out clears it.
 */
export function useDetoxMarks(): { days: Set<string>; loading: boolean } {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  if (!fetchedOnce && !snapshot.loading && getCurrentAccount()) {
    // Lazy kick for consumers that mount before the boot hydration — the
    // fetchedOnce flag flips synchronously inside hydrate(), so this fires
    // exactly once per auth session.
    void hydrate();
  }
  return { days: new Set(snapshot.days), loading: snapshot.loading };
}

// Follow the auth state: hydrate on sign-in, clear on sign-out.
onAuthChange(() => void hydrate());
if (getCurrentAccount()) void hydrate();
