/**
 * Log-session slice: personal catalog entries + draft autosave.
 *
 * Personal strains/devices live in localStorage alongside the curated
 * seed catalog. They are merged into the pickers at render time and are
 * prefixed (`my-`) so they never collide with curated slugs.
 *
 * Storage keys (per-account when signed in; the bare legacy keys are the
 * anonymous fallback and are migrated into the first account at signUp —
 * see lib/auth.ts):
 *   - vaporlog.mystrains[.<accountId>]  PersonalStrain[]
 *   - vaporlog.mydevices[.<accountId>]  PersonalDevice[]
 *   - vaporlog.myvocab[.<accountId>]    Record<VocabCategory, string[]>
 *   - vaporlog.draft                    LogDraft (autosaved on every change)
 */
import { getCurrentAccount } from "@/lib/auth";
import type { Device, Strain } from "@/lib/types";

/** Legacy (pre-auth) base keys — anonymous fallback + migration source. */
export const MY_STRAINS_KEY = "vaporlog.mystrains";
export const MY_DEVICES_KEY = "vaporlog.mydevices";
export const MY_VOCAB_KEY = "vaporlog.myvocab";
export const DRAFT_KEY = "vaporlog.draft";

/** Storage key for the CURRENT account's personal strains. */
function myStrainsKey(): string {
  const account = getCurrentAccount();
  return account ? `${MY_STRAINS_KEY}.${account.id}` : MY_STRAINS_KEY;
}

/** Storage key for the CURRENT account's personal devices. */
function myDevicesKey(): string {
  const account = getCurrentAccount();
  return account ? `${MY_DEVICES_KEY}.${account.id}` : MY_DEVICES_KEY;
}

/** Storage key for the CURRENT account's personal vocabulary. */
function myVocabKey(): string {
  const account = getCurrentAccount();
  return account ? `${MY_VOCAB_KEY}.${account.id}` : MY_VOCAB_KEY;
}

/** Personal strains only collect a name + optional type (spec: "Can't find it? Add yours"). */
export interface PersonalStrain {
  slug: string;
  name: string;
  type: "Indica" | "Sativa" | "Hybrid" | null;
}

/** Personal devices mirror the curated Device shape exactly. */
export interface PersonalDevice {
  slug: string;
  name: string;
}

/**
 * The editable state of the log form. Nullable fields stay null until the
 * user touches them — "unset" is a meaningful, skippable state, not zero.
 */
export interface LogDraft {
  strainSlug: string | null;
  deviceSlug: string | null;
  temperatureC: number | null;
  durationMin: number | null;
  amountG: number | null;
  rating: number | null;
  aromas: string[];
  flavors: string[];
  moods: string[];
  activities: string[];
  /** Custom tags the user appended per list (rendered after the vocab chips). */
  customAromas: string[];
  customFlavors: string[];
  customMoods: string[];
  customActivities: string[];
  notes: string;
  isPublic: boolean;
}

export const EMPTY_DRAFT: LogDraft = {
  strainSlug: null,
  deviceSlug: null,
  temperatureC: null,
  durationMin: null,
  amountG: null,
  rating: null,
  aromas: [],
  flavors: [],
  moods: [],
  activities: [],
  customAromas: [],
  customFlavors: [],
  customMoods: [],
  customActivities: [],
  notes: "",
  isPublic: false,
};

/** Turns a display name into a collision-safe personal slug. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "entry";
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage full / private mode — the picker still works in-memory */
  }
}

export function getPersonalStrains(): PersonalStrain[] {
  return readList<PersonalStrain>(myStrainsKey());
}

export function getPersonalDevices(): PersonalDevice[] {
  return readList<PersonalDevice>(myDevicesKey());
}

/**
 * Adds a personal strain. Returns the stored entry; when a strain with the
 * same slug already exists, the existing entry is returned unchanged.
 */
export function addPersonalStrain(
  name: string,
  type: PersonalStrain["type"],
): PersonalStrain {
  const trimmed = name.trim();
  const entry: PersonalStrain = {
    slug: `my-${slugify(trimmed)}`,
    name: trimmed,
    type,
  };
  const list = getPersonalStrains();
  const existing = list.find((s) => s.slug === entry.slug);
  if (existing) return existing;
  writeList(myStrainsKey(), [...list, entry]);
  return entry;
}

/** Adds a personal device (deduped by slug, same contract as addPersonalStrain). */
export function addPersonalDevice(name: string): PersonalDevice {
  const trimmed = name.trim();
  const entry: PersonalDevice = {
    slug: `my-${slugify(trimmed)}`,
    name: trimmed,
  };
  const list = getPersonalDevices();
  const existing = list.find((d) => d.slug === entry.slug);
  if (existing) return existing;
  writeList(myDevicesKey(), [...list, entry]);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Personal vocabulary (custom Experience tags, per account)           */
/* ------------------------------------------------------------------ */

/** The four Experience tag lists that accept personal entries. */
export type VocabCategory = "aromas" | "flavors" | "moods" | "activities";

const VOCAB_CATEGORIES: VocabCategory[] = [
  "aromas",
  "flavors",
  "moods",
  "activities",
];

/** Persisted shape of the personal vocabulary store. */
type PersonalVocabStore = Record<VocabCategory, string[]>;

const EMPTY_PERSONAL_VOCAB: PersonalVocabStore = {
  aromas: [],
  flavors: [],
  moods: [],
  activities: [],
};

/** Reads the whole personal vocabulary store. Never throws. */
function readVocabStore(): PersonalVocabStore {
  try {
    const raw = localStorage.getItem(myVocabKey());
    if (!raw) return { ...EMPTY_PERSONAL_VOCAB };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...EMPTY_PERSONAL_VOCAB };
    }
    // Normalize per category so a partially corrupt store stays usable.
    const store = { ...EMPTY_PERSONAL_VOCAB };
    for (const category of VOCAB_CATEGORIES) {
      const list = (parsed as Record<string, unknown>)[category];
      store[category] = Array.isArray(list)
        ? list.filter((t): t is string => typeof t === "string")
        : [];
    }
    return store;
  } catch {
    return { ...EMPTY_PERSONAL_VOCAB };
  }
}

function writeVocabStore(store: PersonalVocabStore): void {
  try {
    localStorage.setItem(myVocabKey(), JSON.stringify(store));
  } catch {
    /* storage full / private mode — the picker still works in-memory */
  }
}

/** Personal tags of one Experience category. Never throws. */
export function getPersonalVocab(category: VocabCategory): string[] {
  return readVocabStore()[category];
}

/**
 * Adds a personal tag to one Experience category, deduped
 * case-insensitively against the stored tags. Never throws.
 */
export function addPersonalVocab(category: VocabCategory, tag: string): void {
  const trimmed = tag.trim();
  if (!trimmed) return;
  const store = readVocabStore();
  if (
    store[category].some((t) => t.toLowerCase() === trimmed.toLowerCase())
  ) {
    return;
  }
  writeVocabStore({ ...store, [category]: [...store[category], trimmed] });
}

/**
 * Personal entries need to look like catalog entries inside the pickers.
 * Unknown numeric/botanical fields are filled with neutral placeholders —
 * the picker UI shows a "Personal" badge instead of THC for these.
 */
export function personalStrainAsStrain(p: PersonalStrain): Strain {
  return {
    slug: p.slug,
    name: p.name,
    type: p.type ?? "Hybrid",
    thc: 0,
    cbd: 0,
    terpenes: [],
    aromas: [],
    effects: [],
    lineage: "Personal strain",
  };
}

export function personalDeviceAsDevice(p: PersonalDevice): Device {
  return { slug: p.slug, name: p.name };
}

/** True for personal (user-created) slugs — used to badge picker rows. */
export function isPersonalSlug(slug: string): boolean {
  return slug.startsWith("my-");
}

/** Reads the autosaved draft, or null when absent/unreadable. Never throws. */
export function loadDraft(): LogDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LogDraft>;
    if (typeof parsed !== "object" || parsed === null) return null;
    // Merge onto EMPTY_DRAFT so drafts written by older shapes stay valid.
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function saveDraft(draft: LogDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort autosave — never interrupt the form */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
