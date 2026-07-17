/**
 * profile-flow — pure helpers for the /welcome onboarding flow.
 *
 * Owned by the Welcome slice. Everything here is side-effect free so the
 * page components stay thin: birthdate parsing, exact age computation for
 * the 21+ age gate, pseudonym validation, and the "surprise me" handle
 * generator (connoisseur-style, fully local — no network, no availability
 * check needed because profiles never leave this device).
 */

/** Minimum age required by the age gate (spec decision 5). */
export const MIN_AGE = 21;

/** Pseudonym constraints: 3–20 chars, letters / numbers / dashes only. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const BIRTHDATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const USERNAME_PATTERN = /^[A-Za-z0-9-]+$/;

export interface BirthdateParts {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31, validated against the actual month/year. */
  day: number;
}

/**
 * Strictly parses an ISO date string (`YYYY-MM-DD`). Returns `null` for
 * anything malformed or impossible (month 13, Feb 30, day 0, …).
 */
export function parseBirthdate(value: string): BirthdateParts | null {
  const match = BIRTHDATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  // Day 0 of the following month = last day of this month.
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

/** True when `value` is a well-formed, real calendar date. */
export function isValidBirthdate(value: string): boolean {
  return parseBirthdate(value) !== null;
}

/** True when the date is strictly in the future (local time). */
export function isFutureBirthdate(value: string, today: Date = new Date()): boolean {
  const parts = parseBirthdate(value);
  if (!parts) return false;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  const endOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999,
  );
  return date.getTime() > endOfToday.getTime();
}

/** Builds a `YYYY-MM-DD` string from picker parts (zero-padded). */
export function formatBirthdate(parts: BirthdateParts): string {
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

/**
 * Age in full years at `today` for a `YYYY-MM-DD` birthdate.
 * Returns `null` when the birthdate is invalid.
 */
export function computeAge(birthdate: string, today: Date = new Date()): number | null {
  const parts = parseBirthdate(birthdate);
  if (!parts) return null;
  let age = today.getFullYear() - parts.year;
  const monthDelta = today.getMonth() + 1 - parts.month;
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < parts.day)) {
    age -= 1;
  }
  return age;
}

/** True when the birthdate clears the 21+ gate (and is a real date). */
export function meetsAgeRequirement(birthdate: string, today: Date = new Date()): boolean {
  const age = computeAge(birthdate, today);
  return age !== null && age >= MIN_AGE;
}

export interface UsernameValidation {
  valid: boolean;
  /** Human-readable reason, or `null` when valid (or when the field is empty). */
  error: string | null;
}

/**
 * Live-validation helper for the pseudonym field. An empty input is
 * treated as "neutral" (`valid: false`, `error: null`) so the UI can
 * stay quiet until the user actually types something.
 */
export function validateUsername(username: string): UsernameValidation {
  const value = username.trim();
  if (value.length === 0) return { valid: false, error: null };
  if (value.length < USERNAME_MIN_LENGTH) {
    return { valid: false, error: `At least ${USERNAME_MIN_LENGTH} characters.` };
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return { valid: false, error: `${USERNAME_MAX_LENGTH} characters is the max.` };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return { valid: false, error: "Letters, numbers and dashes only." };
  }
  return { valid: true, error: null };
}

/* ------------------------------------------------------------------ */
/* "Surprise me" handle generator                                      */
/* ------------------------------------------------------------------ */

const HANDLE_PREFIXES = [
  "Terp",
  "Cloud",
  "Vapor",
  "Ember",
  "Mist",
  "Sage",
  "Velvet",
  "Amber",
  "Lunar",
  "Aero",
  "Moss",
  "Fern",
  "Halo",
  "Drift",
  "Zen",
] as const;

const HANDLE_SUFFIXES = [
  "Nomad",
  "Cartographer",
  "Sommelier",
  "Curator",
  "Alchemist",
  "Voyageur",
  "Ranger",
  "Botanist",
  "Forager",
  "Pilot",
  "Keeper",
  "Tinker",
  "Wanderer",
  "Scribe",
  "Maven",
] as const;

/**
 * Returns a random connoisseur-style handle (e.g. "TerpNomad",
 * "CloudCartographer"). Guaranteed to pass `validateUsername`.
 * `rng` is injectable for tests.
 */
export function generateHandle(rng: () => number = Math.random): string {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const prefix = HANDLE_PREFIXES[Math.floor(rng() * HANDLE_PREFIXES.length)];
    const suffix = HANDLE_SUFFIXES[Math.floor(rng() * HANDLE_SUFFIXES.length)];
    const handle = `${prefix}${suffix}`;
    if (validateUsername(handle).valid) return handle;
  }
  // Unreachable in practice (all combos are valid), but never fail the user.
  return "TerpNomad";
}
